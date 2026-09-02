/**
 * Orquestación del voto (con I/O). Une la capa de datos, las señales, el reto
 * firmado, Turnstile y el motor puro `decide()`. Los route handlers solo
 * validan el cuerpo y delegan aquí.
 */
import "server-only";
import { getDb, UniqueViolationError, type ExistingVoteMatch, type NewAttempt } from "@/lib/db";
import type { AttemptOutcome, ChallengeResponse, ClientFingerprint, Settings, VoteResponse } from "@/lib/types";
import { CHALLENGE_TTL_SECONDS, issueChallenge, verifyChallenge } from "./challenge";
import { decide, MESSAGES } from "./engine";
import { deriveSignals, getClientIp, type Signals } from "./signals";
import { isTurnstileConfigured, verifyTurnstile } from "./turnstile";

export interface VoteContext {
  headers: Headers;
  fp: ClientFingerprint;
  /** Id de la cookie bl_vid ya verificada (o null si no hay / no es válida). */
  cookieId: string | null;
  dishId: string;
}

export interface CastVoteInput extends VoteContext {
  challenge: string;
  turnstileToken?: string | null;
}

export interface CastVoteResult {
  httpStatus: number;
  body: VoteResponse;
}

/**
 * ¿Este match previo bloquearía el voto como duplicado? Refleja el orden del motor:
 * cookie/storage/voter_key siempre; device_fp solo con strict_device_match.
 */
function isBlockingMatch(existing: ExistingVoteMatch | null, settings: Settings): boolean {
  if (!existing || existing.vote.status === "rejected") return false;
  return existing.matchedBy.some((m) => m !== "device_fp") || (existing.matchedBy.includes("device_fp") && settings.strict_device_match);
}

function lookupFor(signals: Signals, dishId: string) {
  return {
    dishId,
    voterKey: signals.voterKey,
    deviceFp: signals.deviceFp,
    cookieId: signals.cookieId,
    storageId: signals.storageId,
  };
}

/** Emite el reto para un plato. Devuelve null si el plato no existe o no está publicado. */
export async function issueChallengeFor(input: VoteContext): Promise<ChallengeResponse | null> {
  const db = await getDb();
  const dish = await db.getPublishedDish(input.dishId);
  if (!dish) return null;

  const signals = deriveSignals({ headers: input.headers, fp: input.fp, cookieId: input.cookieId });
  const [settings, existing] = await Promise.all([db.getSettings(), db.findExistingVote(lookupFor(signals, dish.id))]);

  return {
    challenge: issueChallenge({ dishId: dish.id, voterKey: signals.voterKey }),
    ttl: CHALLENGE_TTL_SECONDS,
    alreadyVoted: isBlockingMatch(existing, settings),
    votingOpen: settings.voting_open,
  };
}

/** Registra el intento sin romper la respuesta si la auditoría falla. */
async function safeLogAttempt(attempt: NewAttempt): Promise<void> {
  try {
    const db = await getDb();
    await db.logAttempt(attempt);
  } catch (err) {
    console.error("[antifraude] No se pudo registrar el intento:", err instanceof Error ? err.message : err);
  }
}

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const db = await getDb();
  const dish = await db.getPublishedDish(input.dishId);
  if (!dish) {
    return { httpStatus: 404, body: { ok: false, code: "DISH_NOT_FOUND", message: MESSAGES.DISH_NOT_FOUND } };
  }
  const dishId = dish.id;

  const settings = await db.getSettings();
  const signals = deriveSignals({ headers: input.headers, fp: input.fp, cookieId: input.cookieId });
  const challenge = verifyChallenge(input.challenge, { dishId, voterKey: signals.voterKey, now: Date.now() });

  const [history, existing] = await Promise.all([
    db.getVoteHistory({ dishId, ipHash: signals.ipHash, subnetHash: signals.subnetHash, voterKey: signals.voterKey }),
    db.findExistingVote(lookupFor(signals, dishId)),
  ]);

  // Turnstile: solo se consulta si está configurado, hay token y el voto no va a
  // rechazarse antes por reglas previas (evita llamadas inútiles a Cloudflare).
  const captchaConfigured = isTurnstileConfigured();
  const captchaProvided = typeof input.turnstileToken === "string" && input.turnstileToken.trim().length > 0;
  let captchaVerified: boolean | null = null;
  if (captchaConfigured && captchaProvided && settings.voting_open && challenge.ok) {
    captchaVerified = await verifyTurnstile(input.turnstileToken!.trim(), getClientIp(input.headers));
  }

  const decision = decide({
    signals,
    settings,
    history,
    existing,
    challenge: challenge.ok ? { ok: true, ageMs: challenge.ageMs } : { ok: false, reason: challenge.reason, ageMs: challenge.ageMs },
    captcha: { configured: captchaConfigured, provided: captchaProvided, verified: captchaVerified },
  });

  const attemptBase = { dish_id: dishId, voter_key: signals.voterKey, ip_hash: signals.ipHash };

  if (decision.kind === "reject") {
    await safeLogAttempt({ ...attemptBase, outcome: decision.outcome, reasons: decision.reasons, risk_score: decision.risk });
    return { httpStatus: decision.httpStatus, body: { ok: false, code: decision.code, message: decision.message } };
  }

  // Aceptado: insertar. El índice único es la última barrera contra carreras.
  let outcome: AttemptOutcome = decision.status === "valid" ? "accepted" : "suspect";
  let reasons = decision.reasons;
  try {
    await db.insertVote({
      dish_id: dishId,
      voter_key: signals.voterKey,
      device_fp: signals.deviceFp,
      client_fp: signals.clientFp,
      server_fp: signals.serverFp,
      cookie_id: signals.cookieId,
      storage_id: signals.storageId,
      ip_hash: signals.ipHash,
      subnet_hash: signals.subnetHash,
      country: signals.country,
      ua: signals.ua,
      risk_score: decision.risk,
      reasons: decision.reasons,
      status: decision.status,
    });
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      outcome = "duplicate";
      reasons = [...decision.reasons, "race", err.field];
      await safeLogAttempt({ ...attemptBase, outcome, reasons, risk_score: decision.risk });
      return { httpStatus: 409, body: { ok: false, code: "ALREADY_VOTED", message: MESSAGES.ALREADY_VOTED } };
    }
    await safeLogAttempt({ ...attemptBase, outcome: "rejected", reasons: [...decision.reasons, "db_error"], risk_score: decision.risk });
    throw err;
  }

  await safeLogAttempt({ ...attemptBase, outcome, reasons, risk_score: decision.risk });
  const votes_count = await db.getValidVotesCount(dishId);
  return { httpStatus: 200, body: { ok: true, status: decision.status, votes_count } };
}

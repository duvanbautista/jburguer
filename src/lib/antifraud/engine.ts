/**
 * Motor antifraude: función PURA (sin I/O) que aplica, en este orden exacto,
 * las reglas del sistema antifraude (orden y umbrales documentados abajo):
 *   1. votación cerrada          → VOTING_CLOSED (403)
 *   2. challenge inválido        → BAD_CHALLENGE (403)
 *   3. duplicado por señal fuerte (cookie > storage > voter_key > device_fp) → ALREADY_VOTED (409)
 *   4. límites duros por IP      → RATE_LIMITED (429); límites blandos → riesgo
 *   5. calidad de la huella      → riesgo
 *   6. Turnstile (si configurado)→ CAPTCHA_REQUIRED / CAPTCHA_FAILED (403)
 *   7. status = risk >= suspect_threshold ? 'suspect' : 'valid'
 *      (con device_match en modo no estricto el voto es 'suspect' siempre)
 */
import type { ExistingVoteMatch, VoteHistory } from "@/lib/db/types";
import type { AttemptOutcome, Settings, VoteErrorCode } from "@/lib/types";
import type { Signals } from "./signals";

export interface EngineInput {
  signals: Signals;
  settings: Settings;
  history: VoteHistory;
  existing: ExistingVoteMatch | null;
  challenge: { ok: boolean; reason?: string; ageMs: number };
  captcha: { configured: boolean; provided: boolean; verified: boolean | null };
}

export type Decision =
  | { kind: "accept"; status: "valid" | "suspect"; risk: number; reasons: string[] }
  | {
      kind: "reject";
      code: VoteErrorCode;
      httpStatus: number;
      outcome: AttemptOutcome;
      risk: number;
      reasons: string[];
      message: string;
    };

/* ───────────── Umbrales fijos (los configurables vienen en Settings) ───────────── */
export const LIMITS = {
  ipVotesAll10mHard: 15,
  ipAttempts10mHard: 30,
  ipVotesAll10mSoft: 6,
  subnetVotesDish1hSoft: 20,
  voterAttempts10mSoft: 5,
  tooFastMs: 3000,
} as const;

export const RISK = {
  device_match: 45,
  ip_shared: 40,
  ip_burst: 20,
  subnet_burst: 20,
  voter_retry: 25,
  weak_fp: 30,
  bot_ua: 50,
  fp_version: 30,
  too_fast: 15,
  no_cookie: 10,
  no_storage: 10,
} as const;

/** Mensajes para el usuario final (español). */
export const MESSAGES: Record<VoteErrorCode, string> = {
  VOTING_CLOSED: "La votación está cerrada en este momento.",
  BAD_CHALLENGE: "Tu sesión de voto expiró o no es válida. Recarga la página e inténtalo de nuevo.",
  ALREADY_VOTED: "Ya votaste por este plato. ¡Gracias por participar!",
  RATE_LIMITED: "Demasiados votos desde tu red en poco tiempo. Inténtalo de nuevo más tarde.",
  CAPTCHA_REQUIRED: "Necesitamos confirmar que eres una persona. Completa la verificación e inténtalo de nuevo.",
  CAPTCHA_FAILED: "La verificación no fue exitosa. Inténtalo de nuevo.",
  DISH_NOT_FOUND: "No encontramos ese plato.",
  BAD_REQUEST: "La solicitud no es válida.",
};

function reject(
  code: VoteErrorCode,
  httpStatus: number,
  outcome: AttemptOutcome,
  risk: number,
  reasons: string[],
): Decision {
  return { kind: "reject", code, httpStatus, outcome, risk, reasons, message: MESSAGES[code] };
}

export function decide(input: EngineInput): Decision {
  const { signals, settings, history, challenge, captcha } = input;
  const reasons: string[] = [];
  let risk = 0;
  let forceSuspect = false;

  // 1. Votación cerrada
  if (!settings.voting_open) {
    return reject("VOTING_CLOSED", 403, "voting_closed", 0, ["voting_closed"]);
  }

  // 2. Challenge
  if (!challenge.ok) {
    const detail = challenge.reason ? [challenge.reason] : [];
    return reject("BAD_CHALLENGE", 403, "bad_challenge", 0, ["bad_challenge", ...detail]);
  }

  // 3. Duplicados por señal fuerte (solo cuentan votos activos, nunca los rechazados)
  const existing = input.existing && input.existing.vote.status !== "rejected" ? input.existing : null;
  if (existing) {
    const by = new Set(existing.matchedBy);
    if (by.has("cookie_id")) return reject("ALREADY_VOTED", 409, "duplicate", 0, ["cookie"]);
    if (by.has("storage_id")) return reject("ALREADY_VOTED", 409, "duplicate", 0, ["storage"]);
    if (by.has("voter_key")) return reject("ALREADY_VOTED", 409, "duplicate", 0, ["device+headers"]);
    if (by.has("device_fp")) {
      if (settings.strict_device_match) return reject("ALREADY_VOTED", 409, "duplicate", 0, ["device"]);
      // Modo no estricto: el posible duplicado no se rechaza pero SIEMPRE entra en
      // cuarentena (ANTIFRAUDE.md §3/§6), aunque el riesgo no alcance el umbral.
      risk += RISK.device_match;
      reasons.push("device_match");
      forceSuspect = true;
    }
  }

  // 4. Red / IP: límites duros primero, luego riesgo blando
  if (history.ipVotesDish24h >= settings.ip_hard_limit) {
    return reject("RATE_LIMITED", 429, "rate_limited", risk, [...reasons, "ip_hard_limit"]);
  }
  if (history.ipVotesAll10m >= LIMITS.ipVotesAll10mHard) {
    return reject("RATE_LIMITED", 429, "rate_limited", risk, [...reasons, "ip_votes_10m"]);
  }
  if (history.ipAttempts10m >= LIMITS.ipAttempts10mHard) {
    return reject("RATE_LIMITED", 429, "rate_limited", risk, [...reasons, "ip_attempts_10m"]);
  }
  if (history.ipVotesDish24h >= settings.ip_soft_limit) {
    risk += RISK.ip_shared;
    reasons.push("ip_shared");
  }
  if (history.ipVotesAll10m >= LIMITS.ipVotesAll10mSoft) {
    risk += RISK.ip_burst;
    reasons.push("ip_burst");
  }
  if (history.subnetVotesDish1h >= LIMITS.subnetVotesDish1hSoft) {
    risk += RISK.subnet_burst;
    reasons.push("subnet_burst");
  }
  if (history.voterAttempts10m >= LIMITS.voterAttempts10mSoft) {
    risk += RISK.voter_retry;
    reasons.push("voter_retry");
  }

  // 5. Calidad de la huella
  if (!signals.fpQuality.hasCanvas && !signals.fpQuality.hasWebgl) {
    risk += RISK.weak_fp;
    reasons.push("weak_fp");
  }
  if (signals.botUa) {
    risk += RISK.bot_ua;
    reasons.push("bot_ua");
  }
  if (!signals.fpQuality.versionOk) {
    risk += RISK.fp_version;
    reasons.push("fp_version");
  }
  if (challenge.ageMs < LIMITS.tooFastMs) {
    risk += RISK.too_fast;
    reasons.push("too_fast");
  }
  if (!signals.cookieId) {
    risk += RISK.no_cookie;
    reasons.push("no_cookie");
  }
  if (!signals.storageId) {
    risk += RISK.no_storage;
    reasons.push("no_storage");
  }

  // 6. Turnstile (solo si está configurado)
  if (captcha.configured) {
    if (!captcha.provided) {
      return reject("CAPTCHA_REQUIRED", 403, "rejected", risk, [...reasons, "captcha_required"]);
    }
    if (captcha.verified !== true) {
      return reject("CAPTCHA_FAILED", 403, "rejected", risk, [...reasons, "captcha_failed"]);
    }
  }

  // 7. Estado final
  const status = forceSuspect || risk >= settings.suspect_threshold ? "suspect" : "valid";
  return { kind: "accept", status, risk, reasons };
}

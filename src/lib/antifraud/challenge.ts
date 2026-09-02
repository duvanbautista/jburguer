/**
 * Reto de voto: token firmado que vincula plato + voter_key + instante de emisión.
 * Obliga a pasar por /api/vote/challenge con la misma huella antes de votar y
 * fija una edad mínima (anti-automatización) y máxima (anti-reutilización).
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getVoteSecret, hmac, safeEqual } from "./hash";

export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const CHALLENGE_TTL_SECONDS = CHALLENGE_TTL_MS / 1000;
export const CHALLENGE_MIN_AGE_MS = 1500;

export type ChallengeFailReason =
  | "bad_signature"
  | "expired"
  | "dish_mismatch"
  | "voter_mismatch"
  | "too_fast"
  | "malformed";

export type ChallengeVerification =
  | { ok: true; issuedAt: number; ageMs: number }
  | { ok: false; reason: ChallengeFailReason; ageMs: number };

const payloadSchema = z.object({
  d: z.string().min(1),
  v: z.string().min(1),
  t: z.number().int().nonnegative(),
  n: z.string().min(1),
});

function sign(payloadB64: string): string {
  return hmac(getVoteSecret(), "challenge", payloadB64);
}

export function issueChallenge({
  dishId,
  voterKey,
  now = Date.now(),
}: {
  dishId: string;
  voterKey: string;
  now?: number;
}): string {
  const payload = { d: dishId, v: voterKey, t: now, n: randomBytes(8).toString("hex") };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyChallenge(
  token: string,
  { dishId, voterKey, now = Date.now() }: { dishId: string; voterKey: string; now?: number },
): ChallengeVerification {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "malformed", ageMs: 0 };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed", ageMs: 0 };
  const [payloadB64, signature] = parts;

  // La firma se comprueba ANTES de interpretar el contenido.
  if (!safeEqual(signature, sign(payloadB64))) return { ok: false, reason: "bad_signature", ageMs: 0 };

  let parsed: z.infer<typeof payloadSchema>;
  try {
    const json: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const res = payloadSchema.safeParse(json);
    if (!res.success) return { ok: false, reason: "malformed", ageMs: 0 };
    parsed = res.data;
  } catch {
    return { ok: false, reason: "malformed", ageMs: 0 };
  }

  const ageMs = now - parsed.t;
  if (parsed.d !== dishId) return { ok: false, reason: "dish_mismatch", ageMs };
  if (!safeEqual(parsed.v, voterKey)) return { ok: false, reason: "voter_mismatch", ageMs };
  if (ageMs > CHALLENGE_TTL_MS) return { ok: false, reason: "expired", ageMs };
  if (ageMs < CHALLENGE_MIN_AGE_MS) return { ok: false, reason: "too_fast", ageMs };
  return { ok: true, issuedAt: parsed.t, ageMs };
}

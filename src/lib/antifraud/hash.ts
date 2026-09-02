/**
 * Primitivas de hash del sistema antifraude. Solo servidor (node:crypto).
 * Todo identificador sensible (IP, huella, cookie) se guarda como HMAC-SHA256
 * con VOTE_SECRET: sin el secreto no se pueden correlacionar fuera del sistema.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEV_FALLBACK_SECRET = "burger-liga-dev-secret-NO-USAR-EN-PRODUCCION";
/** Separador entre partes: evita que ("ab","c") y ("a","bc") colisionen. */
const PART_SEPARATOR = "\u001f";

let warnedMissingSecret = false;

/**
 * Secreto HMAC. Obligatorio en producción; en desarrollo, si falta, se usa un
 * valor por defecto y se avisa una sola vez.
 */
export function getVoteSecret(): string {
  const secret = process.env.VOTE_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("VOTE_SECRET es obligatorio en producción (ver .env.example).");
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn("[antifraude] VOTE_SECRET no está definido: usando un secreto por defecto SOLO para desarrollo.");
  }
  return DEV_FALLBACK_SECRET;
}

export type HashPart = string | number | boolean | null | undefined;

/** HMAC-SHA256 en hex de las partes concatenadas con un separador no imprimible. */
export function hmac(secret: string, ...parts: HashPart[]): string {
  const h = createHmac("sha256", secret);
  h.update(parts.map((p) => (p === null || p === undefined ? "" : String(p))).join(PART_SEPARATOR));
  return h.digest("hex");
}

/** SHA-256 en hex (sin secreto). */
export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * JSON determinista: claves de objeto ordenadas alfabéticamente en todos los
 * niveles, para que el mismo conjunto de componentes produzca el mismo hash.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key]);
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/** Comparación en tiempo constante de dos cadenas (p. ej. firmas hex). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

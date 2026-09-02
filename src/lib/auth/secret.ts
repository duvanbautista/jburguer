/**
 * Secreto HMAC (VOTE_SECRET) para firmar la cookie de sesión demo.
 * Reexporta la implementación única del sistema antifraude para que cookies,
 * retos, hashes y sesión demo compartan exactamente el mismo valor (incluido
 * el de respaldo en desarrollo). Obligatorio en producción.
 */
export { getVoteSecret } from "@/lib/antifraud/hash";

/**
 * Constantes de auth sin dependencias pesadas (importables desde src/proxy.ts).
 */

/** Cookie de sesión del modo demo (sin Supabase): base64url(json{uid,exp}) + "." + hmac. */
export const DEMO_SESSION_COOKIE = "bl_demo_session";

/** Duración de la sesión demo en segundos (7 días). */
export const DEMO_SESSION_TTL_S = 7 * 24 * 60 * 60;

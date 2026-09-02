/**
 * Cookie de votante `bl_vid`: httpOnly, firmada con HMAC(VOTE_SECRET).
 * Valor = <uuid>.<firma hex>. Se siembra en proxy.ts en la primera visita y,
 * como respaldo, en /api/vote/challenge. Usable en proxy y en route handlers
 * (ambos corren en runtime Node).
 */
import { randomUUID } from "node:crypto";
import { getVoteSecret, hmac, safeEqual } from "./hash";

export const COOKIE_NAME = "bl_vid";
/**
 * Cabecera interna (proxy → handler, nunca llega del cliente: el proxy la borra o
 * la sobrescribe) con el valor de cookie recién emitido en esta misma petición.
 * La cabecera `cookie` NO se reescribe: así el handler distingue "el navegador
 * envió la cookie" de "acabamos de sembrarla" (señal `no_cookie` del motor).
 */
export const SEEDED_HEADER = "x-bl-vid-seeded";
/** 400 días: máximo que aceptan los navegadores modernos. */
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/** Opciones estándar de la cookie (secure solo en producción para permitir http://localhost). */
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

function sign(id: string): string {
  return hmac(getVoteSecret(), "cookie", id);
}

/** Genera un id nuevo y su valor firmado listo para Set-Cookie. */
export function issueCookieValue(): { id: string; value: string } {
  const id = randomUUID();
  return { id, value: `${id}.${sign(id)}` };
}

/** Devuelve el id si el valor tiene formato válido y firma correcta; si no, null. */
export function parseCookieValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!UUID_RE.test(id) || signature.length === 0) return null;
  return safeEqual(signature, sign(id)) ? id : null;
}

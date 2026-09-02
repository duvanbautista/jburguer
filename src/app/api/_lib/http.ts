/**
 * Utilidades compartidas por los route handlers de /api.
 * Todas las respuestas son JSON sin caché (Cache-Control: no-store).
 */
import { NextResponse } from "next/server";
import { MESSAGES } from "@/lib/antifraud/engine";
import type { VoteErrorCode, VoteErrorResponse } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Respuesta JSON con no-store. */
export function json<T>(body: T, init?: { status?: number }): NextResponse<T> {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Error con la forma de VoteErrorResponse (compartida por toda la API). */
export function errorJson(code: VoteErrorCode, status: number, message?: string): NextResponse<VoteErrorResponse> {
  return json<VoteErrorResponse>({ ok: false, code, message: message ?? MESSAGES[code] }, { status });
}

export type BodyResult = { ok: true; data: unknown } | { ok: false };

/** Lee el cuerpo como JSON; nunca lanza. */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  try {
    const data: unknown = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/** Error 500 genérico: registra la causa y devuelve un mensaje neutro. */
export function internalError(context: string, err: unknown): NextResponse<VoteErrorResponse> {
  console.error(`[api] ${context}:`, err instanceof Error ? err.stack ?? err.message : err);
  return errorJson("BAD_REQUEST", 500, "Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.");
}

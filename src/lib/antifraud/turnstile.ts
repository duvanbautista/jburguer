/**
 * Verificación de Cloudflare Turnstile (captcha invisible). Capa opcional:
 * solo se activa si TURNSTILE_SECRET_KEY está definida.
 */
import { z } from "zod";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

const responseSchema = z.object({ success: z.boolean() });

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

/** true solo si Cloudflare confirma el token. Cualquier error de red/parseo => false. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "0.0.0.0") form.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const json: unknown = await res.json();
    const parsed = responseSchema.safeParse(json);
    return parsed.success && parsed.data.success;
  } catch (err) {
    console.error("[antifraude] Error verificando Turnstile:", err instanceof Error ? err.message : err);
    return false;
  }
}

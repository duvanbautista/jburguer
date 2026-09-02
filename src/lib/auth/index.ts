/**
 * Sesión y autenticación del panel (admin / restaurante). Solo servidor.
 *
 *  - Modo Supabase: @supabase/ssr con cookies; el perfil sale de la tabla profiles.
 *  - Modo demo (sin Supabase): cookie httpOnly 'bl_demo_session' firmada con
 *    HMAC(VOTE_SECRET); cuentas de seed-data.ts con DEMO_PASSWORD.
 *
 * signInWithPassword y signOut escriben cookies: deben llamarse desde un
 * server action o route handler (nunca durante el render de un componente).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { getDb, hasSupabaseEnv } from "@/lib/db";
import { demoAdminEmail, demoAdminPassword, demoUserId } from "@/lib/db/demo-ids";
import { DEMO_PASSWORD, SEED_RESTAURANTS } from "@/lib/seed-data";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Profile, Session } from "@/lib/types";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_TTL_S } from "./constants";
import { getVoteSecret } from "./secret";

export { DEMO_SESSION_COOKIE, DEMO_SESSION_TTL_S } from "./constants";

export type SignInResult = { ok: true } | { ok: false; error: string };

/* ───────────────────────────── Token demo ───────────────────────────── */

const demoPayload = z.object({ uid: z.string().min(1), exp: z.number().int() });

function sign(payload: string): string {
  return createHmac("sha256", getVoteSecret()).update(payload).digest("hex");
}

function encodeDemoToken(uid: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Devuelve el uid si la firma es válida y no ha expirado; null en caso contrario. */
function decodeDemoToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const signature = token.slice(i + 1);
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = demoPayload.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    if (parsed.data.exp * 1000 < Date.now()) return null;
    return parsed.data.uid;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Cuentas del modo demo: admin + una por restaurante. */
function demoAccounts(): Array<{ email: string; password: string }> {
  return [
    { email: demoAdminEmail(), password: demoAdminPassword() },
    ...SEED_RESTAURANTS.map((r) => ({ email: r.email.toLowerCase(), password: DEMO_PASSWORD })),
  ];
}

/* ───────────────────────────── Sesión ───────────────────────────── */

async function loadDemoSession(): Promise<Session | null> {
  const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  if (!token) return null;
  const uid = decodeDemoToken(token);
  if (!uid) return null;
  const profile = await (await getDb()).getProfileByUserId(uid);
  if (!profile) return null;
  return { user: { id: profile.id, email: profile.email }, profile };
}

async function loadSupabaseSession(): Promise<Session | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  const email = user.email ?? "";
  let profile: Profile | null = await (await getDb()).getProfileByUserId(user.id);
  if (!profile) {
    // El trigger handle_new_user debería haberlo creado; se reconstruye desde app_metadata.
    const roleClaim: unknown = user.app_metadata?.role;
    profile = {
      id: user.id,
      email,
      role: roleClaim === "admin" ? "admin" : "restaurant",
      restaurant_id: null,
      created_at: user.created_at,
    };
  }
  return { user: { id: user.id, email }, profile };
}

// Memoizada por petición (React cache): varias llamadas en un render = una consulta.
const loadSession = cache(async (): Promise<Session | null> => {
  return hasSupabaseEnv() ? loadSupabaseSession() : loadDemoSession();
});

export async function getSession(): Promise<Session | null> {
  return loadSession();
}

/* ───────────────────────────── Login / logout ───────────────────────────── */

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "El correo aún no está confirmado.";
  if (/rate limit/i.test(message)) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  return `No se pudo iniciar sesión: ${message}`;
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return { ok: false, error: "Escribe tu correo y contraseña." };

  if (hasSupabaseEnv()) {
    const supabase = await createServerSupabase();
    if (!supabase) return { ok: false, error: "Supabase no está configurado." };
    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true };
  }

  // Modo demo.
  const account = demoAccounts().find((a) => a.email === normalized);
  if (!account || !safeEqual(account.password, password)) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  const uid = demoUserId(normalized);
  const profile = await (await getDb()).getProfileByUserId(uid);
  if (!profile) return { ok: false, error: "La cuenta demo no tiene perfil asociado." };

  const exp = Math.floor(Date.now() / 1000) + DEMO_SESSION_TTL_S;
  (await cookies()).set(DEMO_SESSION_COOKIE, encodeDemoToken(uid, exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_SESSION_TTL_S,
  });
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (hasSupabaseEnv()) {
    const supabase = await createServerSupabase();
    if (supabase) await supabase.auth.signOut();
    return;
  }
  (await cookies()).delete(DEMO_SESSION_COOKIE);
}

/* ───────────────────────────── Guardas ───────────────────────────── */

/** Lanza redirect('/login') si no hay sesión. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Lanza redirect('/admin') si la sesión no es de administrador. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== "admin") redirect("/admin");
  return session;
}

export function canManageRestaurant(session: Session, restaurantId: string): boolean {
  if (session.profile.role === "admin") return true;
  return session.profile.role === "restaurant" && session.profile.restaurant_id === restaurantId;
}

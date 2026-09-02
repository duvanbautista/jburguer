/**
 * Proxy (antes middleware) de Next 16. Corre en runtime Node por defecto
 * (la opción `runtime` no se admite en este archivo).
 *  - Siembra la cookie de votante `bl_vid` (httpOnly, firmada) si falta o su firma
 *    no es válida. El valor emitido viaja al handler en la cabecera interna
 *    SEEDED_HEADER; la cabecera `cookie` se deja intacta para que el motor pueda
 *    detectar navegadores que bloquean cookies (señal `no_cookie`).
 *  - Refresca la sesión de Supabase en las páginas (no en /api: la API pública no usa sesión).
 *  - Comprobación optimista de /admin: sin ninguna cookie de sesión responde 307 a /login
 *    (el layout de /admin hace la verificación real; aquí solo se evita el 200 + redirección
 *    en cliente que produce redirect() bajo el loading.tsx raíz).
 *  - Añade cabeceras de seguridad básicas.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SEEDED_HEADER,
  cookieOptions,
  issueCookieValue,
  parseCookieValue,
} from "@/lib/antifraud/cookie";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/constants";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

let warnedCookieFailure = false;

/** ¿Trae alguna cookie de sesión (demo o Supabase Auth)? Solo presencia: no valida nada. */
function hasSessionCookie(request: NextRequest): boolean {
  if (request.cookies.has(DEMO_SESSION_COOKIE)) return true;
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // 1. Cookie de votante. Nunca se confía en SEEDED_HEADER si viene del cliente.
  request.headers.delete(SEEDED_HEADER);
  let seeded: string | null = null;
  try {
    if (!parseCookieValue(request.cookies.get(COOKIE_NAME)?.value)) {
      seeded = issueCookieValue().value;
      request.headers.set(SEEDED_HEADER, seeded);
    }
  } catch (err) {
    // P. ej. VOTE_SECRET ausente en producción: la web sigue sirviéndose; votar fallará con error claro.
    if (!warnedCookieFailure) {
      warnedCookieFailure = true;
      console.error("[proxy] No se pudo sembrar la cookie de votante:", err instanceof Error ? err.message : err);
    }
  }

  // 2. Sesión (solo páginas). NextResponse.next({ request }) reenvía las cabeceras del request.
  let response: NextResponse;
  if (isApi) {
    response = NextResponse.next({ request });
  } else if (isAdmin && !hasSessionCookie(request)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    response = NextResponse.redirect(login, 307);
  } else {
    try {
      response = await refreshSupabaseSession(request);
    } catch (err) {
      console.error("[proxy] No se pudo refrescar la sesión:", err instanceof Error ? err.message : err);
      response = NextResponse.next({ request });
    }
  }

  // 3. Set-Cookie de la cookie recién emitida.
  if (seeded) response.cookies.set(COOKIE_NAME, seeded, cookieOptions());

  // 4. Cabeceras de seguridad.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!isApi) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next, optimización de imágenes, favicon y archivos con extensión estática.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)",
  ],
};

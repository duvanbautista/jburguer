/**
 * Refresco de la sesión de Supabase desde src/proxy.ts.
 *
 * Uso (en `export async function proxy(request)`):
 *   const response = await refreshSupabaseSession(request);
 *   // ...añadir cookies/cabeceras propias sobre `response` y devolverlo.
 *
 * En modo demo (sin variables públicas) devuelve `NextResponse.next()` sin tocar nada.
 * Refrescar aquí es necesario porque los componentes de servidor no pueden
 * escribir cookies: sin esto la sesión caduca y el usuario se desloguea.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // Fuerza la validación/refresco del token: si caducó, setAll escribe las nuevas cookies.
  await supabase.auth.getUser();
  return response;
}

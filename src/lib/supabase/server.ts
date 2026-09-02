/**
 * Cliente de Supabase para servidor (componentes, server actions, route handlers)
 * autenticado con las cookies del usuario. Crear uno NUEVO por petición.
 * Devuelve null en modo demo (sin variables públicas).
 */
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Desde un componente de servidor no se pueden escribir cookies:
          // el refresco de sesión lo hace src/proxy.ts (ver ./proxy.ts).
        }
      },
    },
  });
}

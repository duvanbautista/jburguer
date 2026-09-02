import type { Db } from "./types";

let cached: Db | null = null;

/** true si hay credenciales de Supabase; false => modo demo en memoria. */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Devuelve la implementación de datos activa. Solo servidor.
 * Import dinámico para que el bundle cliente nunca incluya el service role.
 */
export async function getDb(): Promise<Db> {
  if (cached) return cached;
  if (hasSupabaseEnv()) {
    const { createSupabaseDb } = await import("./supabase");
    cached = createSupabaseDb();
  } else {
    const { createMemoryDb } = await import("./memory");
    cached = createMemoryDb();
  }
  return cached;
}

export * from "./types";

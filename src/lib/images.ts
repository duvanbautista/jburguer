/**
 * Decide si una URL de imagen puede pasar por el optimizador de next/image.
 * Debe ir en sintonía con `images.remotePatterns` de next.config.ts:
 *  - rutas locales (/demo/*.jpg, /uploads/* en modo memoria) → sí
 *  - Supabase Storage público (*.supabase.co o el origen de NEXT_PUBLIC_SUPABASE_URL) → sí
 *  - cualquier otro origen remoto → no (se sirve sin optimizar para no fallar en runtime)
 * Funciona en servidor y cliente (NEXT_PUBLIC_* se inyecta en el bundle).
 */
const STORAGE_PUBLIC_PATH = "/storage/v1/object/public/";

export function isOptimizableImageSrc(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (!url.pathname.startsWith(STORAGE_PUBLIC_PATH)) return false;
  if (url.protocol === "https:" && url.hostname.endsWith(".supabase.co")) return true;
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return false;
  try {
    return new URL(configured).origin === url.origin;
  } catch {
    return false;
  }
}

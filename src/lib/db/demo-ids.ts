/**
 * Identidades deterministas para el modo demo (sin Supabase).
 * memory.ts y src/lib/auth usan las mismas funciones, así el uuid del perfil
 * sembrado coincide con el uid que va en la cookie de sesión demo.
 */
import { createHash } from "node:crypto";
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD } from "@/lib/seed-data";

const NAMESPACE = "burger-liga-demo-user:";

/** UUID determinista (formato v5, basado en nombre) derivado del correo. */
export function demoUserId(email: string): string {
  const h = createHash("sha256")
    .update(NAMESPACE + email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
  // Nibble de versión = 5 y variante RFC 4122 (8, 9, a, b).
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const hex = h.slice(0, 12) + "5" + h.slice(13, 16) + variant + h.slice(17, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Correo del admin demo (se puede sobreescribir con DEMO_ADMIN_EMAIL). */
export function demoAdminEmail(): string {
  return (process.env.DEMO_ADMIN_EMAIL || DEMO_ADMIN_EMAIL).trim().toLowerCase();
}

/** Contraseña del admin demo (se puede sobreescribir con DEMO_ADMIN_PASSWORD). */
export function demoAdminPassword(): string {
  return process.env.DEMO_ADMIN_PASSWORD || DEMO_PASSWORD;
}

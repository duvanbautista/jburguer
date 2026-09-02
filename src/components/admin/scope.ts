import type { Session } from "@/lib/types";

/** true si la sesión pertenece a un administrador del festival. */
export function isAdmin(session: Session): boolean {
  return session.profile.role === "admin";
}

/** Id del restaurante que gestiona la cuenta (null para admin o cuenta sin asignar). */
export function ownRestaurantId(session: Session): string | null {
  if (isAdmin(session)) return null;
  return session.profile.restaurant_id;
}

/**
 * Filtro para las consultas de Db: `undefined` para admin (ve todo);
 * para restaurante, su id (o un id imposible si aún no tiene restaurante asignado,
 * para que las consultas devuelvan vacío en lugar de todo).
 */
export function restaurantScope(session: Session): { restaurantId: string } | undefined {
  if (isAdmin(session)) return undefined;
  return { restaurantId: session.profile.restaurant_id ?? "00000000-0000-0000-0000-000000000000" };
}

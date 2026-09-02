import { EmptyState } from "./ui";

/** Aviso para cuentas de restaurante que aún no tienen restaurante asignado. */
export function NoRestaurant() {
  return (
    <EmptyState
      title="Tu cuenta aún no tiene un restaurante asignado"
      description="Pide al organizador del festival que asigne tu cuenta a un restaurante desde el panel de administración (Restaurantes → Cuentas). Hasta entonces no podrás gestionar platos ni ver votos."
    />
  );
}

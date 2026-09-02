import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatNumber } from "@/components/admin/format";
import { LinkButton, PageHeader } from "@/components/admin/ui";
import { RestaurantForm } from "@/components/admin/restaurant-form";
import { DeleteConfirm } from "@/components/admin/delete-confirm";
import { deleteRestaurant, updateRestaurant } from "../../actions";

export const metadata: Metadata = { title: "Editar restaurante" };

export default async function EditRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const db = await getDb();
  const restaurant = await db.getRestaurant(id);
  if (!restaurant) notFound();

  const dishes = await db.listDishes({ restaurantId: restaurant.id });

  return (
    <>
      <PageHeader
        title={restaurant.name}
        description={`${restaurant.city} · ${formatNumber(dishes.length)} ${dishes.length === 1 ? "plato" : "platos"}`}
        actions={
          <>
            <LinkButton href={`/admin/platos`} variant="secondary">
              Ver platos
            </LinkButton>
            <LinkButton href="/admin/restaurantes" variant="ghost">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Volver
            </LinkButton>
          </>
        }
      />

      <RestaurantForm mode="edit" action={updateRestaurant.bind(null, restaurant.id)} restaurant={restaurant} />

      <div className="mt-10">
        <DeleteConfirm
          action={deleteRestaurant.bind(null, restaurant.id)}
          entityName={restaurant.name}
          title="Eliminar restaurante"
          warning={`Se eliminarán también sus ${formatNumber(dishes.length)} ${dishes.length === 1 ? "plato" : "platos"} con todos sus votos, y las cuentas asignadas quedarán sin restaurante. Esta acción no se puede deshacer.`}
          buttonLabel="Eliminar restaurante"
        />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { canManageRestaurant, requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/components/admin/scope";
import { formatNumber } from "@/components/admin/format";
import { LinkButton, PageHeader } from "@/components/admin/ui";
import { DishForm } from "@/components/admin/dish-form";
import { DeleteConfirm } from "@/components/admin/delete-confirm";
import { deleteDish, updateDish } from "../../actions";

export const metadata: Metadata = { title: "Editar plato" };

export default async function EditDishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const db = await getDb();
  const dish = await db.getDish(id);
  // Un restaurante no debe ni saber que existe un plato ajeno: 404 en ambos casos.
  if (!dish || !canManageRestaurant(session, dish.restaurant_id)) notFound();

  const admin = isAdmin(session);
  const restaurants = admin
    ? (await db.listRestaurants())
        .map((r) => ({ id: r.id, name: r.name, city: r.city }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
    : [];

  return (
    <>
      <PageHeader
        title={dish.name}
        description={`${dish.restaurant.name} · ${formatNumber(dish.votes_count)} votos válidos · ${dish.is_published ? "publicado" : "borrador"}`}
        actions={
          <LinkButton href="/admin/platos" variant="ghost">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Volver
          </LinkButton>
        }
      />

      <DishForm
        mode="edit"
        action={updateDish.bind(null, dish.id)}
        dish={dish}
        restaurants={restaurants}
        fixedRestaurant={admin ? null : { id: dish.restaurant.id, name: dish.restaurant.name }}
      />

      <div className="mt-10">
        <DeleteConfirm
          action={deleteDish.bind(null, dish.id)}
          entityName={dish.name}
          title="Eliminar plato"
          warning="Se eliminarán también todos sus votos e intentos registrados. Esta acción no se puede deshacer."
          buttonLabel="Eliminar plato"
        />
      </div>
    </>
  );
}

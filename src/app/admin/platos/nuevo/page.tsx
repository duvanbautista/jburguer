import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAdmin, ownRestaurantId } from "@/components/admin/scope";
import { LinkButton, PageHeader } from "@/components/admin/ui";
import { NoRestaurant } from "@/components/admin/no-restaurant";
import { DishForm } from "@/components/admin/dish-form";
import { createDish } from "../../actions";

export const metadata: Metadata = { title: "Nuevo plato" };

export default async function NewDishPage() {
  const session = await requireSession();
  const admin = isAdmin(session);
  const db = await getDb();

  let restaurants: Array<{ id: string; name: string; city: string }> = [];
  let fixedRestaurant: { id: string; name: string } | null = null;

  if (admin) {
    restaurants = (await db.listRestaurants())
      .map((r) => ({ id: r.id, name: r.name, city: r.city }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } else {
    const restaurantId = ownRestaurantId(session);
    const restaurant = restaurantId ? await db.getRestaurant(restaurantId) : null;
    if (!restaurant) return <NoRestaurant />;
    fixedRestaurant = { id: restaurant.id, name: restaurant.name };
  }

  return (
    <>
      <PageHeader
        title="Nuevo plato"
        description="Nombre, lugar que lo inspira, historia, ingredientes y una foto. Puedes guardarlo como borrador y publicarlo después."
        actions={
          <LinkButton href="/admin/platos" variant="ghost">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Volver
          </LinkButton>
        }
      />
      <DishForm mode="create" action={createDish} restaurants={restaurants} fixedRestaurant={fixedRestaurant} />
    </>
  );
}

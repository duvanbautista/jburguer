import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { LinkButton, PageHeader } from "@/components/admin/ui";
import { RestaurantForm } from "@/components/admin/restaurant-form";
import { createRestaurant } from "../../actions";

export const metadata: Metadata = { title: "Nuevo restaurante" };

export default async function NewRestaurantPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Nuevo restaurante"
        description="Después de crearlo, asígnale una cuenta en la sección «Cuentas y accesos»."
        actions={
          <LinkButton href="/admin/restaurantes" variant="ghost">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Volver
          </LinkButton>
        }
      />
      <RestaurantForm mode="create" action={createRestaurant} />
    </>
  );
}

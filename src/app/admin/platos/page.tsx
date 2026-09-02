import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAdmin, ownRestaurantId, restaurantScope } from "@/components/admin/scope";
import { formatNumber } from "@/components/admin/format";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thumb } from "@/components/admin/ui";
import { NoRestaurant } from "@/components/admin/no-restaurant";

export const metadata: Metadata = { title: "Platos" };

export default async function DishesPage() {
  const session = await requireSession();
  const admin = isAdmin(session);
  if (!admin && !ownRestaurantId(session)) return <NoRestaurant />;

  const db = await getDb();
  const dishes = (await db.listDishes(restaurantScope(session))).sort(
    (a, b) => a.restaurant.name.localeCompare(b.restaurant.name, "es") || a.name.localeCompare(b.name, "es"),
  );

  return (
    <>
      <PageHeader
        title={admin ? "Platos" : "Mis platos"}
        description="Cada plato cuenta la historia de un lugar. Solo los publicados aparecen en el ranking."
        actions={
          <LinkButton href="/admin/platos/nuevo">
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo plato
          </LinkButton>
        }
      />

      {dishes.length === 0 ? (
        <EmptyState
          title="Todavía no hay platos"
          description="Crea el primer plato con su historia, ingredientes y una buena foto."
          action={<LinkButton href="/admin/platos/nuevo">Nuevo plato</LinkButton>}
        />
      ) : (
        <Table minWidth="720px">
          <thead>
            <tr>
              <Th>Plato</Th>
              {admin ? <Th>Restaurante</Th> : null}
              <Th>Inspirado en</Th>
              <Th>Publicado</Th>
              <Th className="text-right">Votos</Th>
              <Th className="text-right">
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((dish) => (
              <tr key={dish.id} className="hover:bg-soft">
                <Td>
                  <Link href={`/admin/platos/${dish.id}`} className="flex items-center gap-3">
                    <Thumb src={dish.image_url} alt="" size={48} />
                    <span className="font-medium text-fg">{dish.name}</span>
                  </Link>
                </Td>
                {admin ? <Td className="text-fg-muted">{dish.restaurant.name}</Td> : null}
                <Td className="text-fg-muted">{dish.inspired_by || "—"}</Td>
                <Td>
                  <Badge tone={dish.is_published ? "success" : "neutral"}>{dish.is_published ? "Sí" : "No"}</Badge>
                </Td>
                <Td className="text-right font-semibold tabular-nums">{formatNumber(dish.votes_count)}</Td>
                <Td className="text-right">
                  <LinkButton href={`/admin/platos/${dish.id}`} variant="secondary" size="sm">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Editar
                  </LinkButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

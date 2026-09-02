import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { DishStats } from "@/lib/types";
import { isAdmin, ownRestaurantId, restaurantScope } from "@/components/admin/scope";
import { formatNumber } from "@/components/admin/format";
import { Badge, EmptyState, KpiCard, LinkButton, PageHeader, Table, Td, Th, Thumb } from "@/components/admin/ui";
import { NoRestaurant } from "@/components/admin/no-restaurant";

export const metadata: Metadata = { title: "Resumen" };

const EMPTY_STATS: Omit<DishStats, "dish_id"> = {
  valid: 0,
  suspect: 0,
  rejected: 0,
  duplicate_attempts: 0,
  rate_limited_attempts: 0,
};

export default async function AdminHomePage() {
  const session = await requireSession();
  const admin = isAdmin(session);
  if (!admin && !ownRestaurantId(session)) return <NoRestaurant />;

  const db = await getDb();
  const scope = restaurantScope(session);
  const [dishes, stats, settings] = await Promise.all([db.listDishes(scope), db.getDishStats(scope), db.getSettings()]);

  const byDish = new Map(stats.map((s) => [s.dish_id, s]));
  const rows = dishes
    .map((dish) => ({ dish, stats: byDish.get(dish.id) ?? { dish_id: dish.id, ...EMPTY_STATS } }))
    .sort((a, b) => b.stats.valid - a.stats.valid || a.dish.name.localeCompare(b.dish.name, "es"));

  const totals = rows.reduce(
    (acc, { stats: s }) => ({
      valid: acc.valid + s.valid,
      suspect: acc.suspect + s.suspect,
      rejected: acc.rejected + s.rejected,
      duplicate_attempts: acc.duplicate_attempts + s.duplicate_attempts,
      rate_limited_attempts: acc.rate_limited_attempts + s.rate_limited_attempts,
    }),
    { ...EMPTY_STATS },
  );

  return (
    <>
      <PageHeader
        title="Resumen"
        description={
          admin
            ? `${settings.festival_name} · ${settings.edition}`
            : "Estado de los votos de tus platos en el festival."
        }
        actions={
          <Badge tone={settings.voting_open ? "success" : "danger"}>
            {settings.voting_open ? "Votación abierta" : "Votación cerrada"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Votos válidos" value={formatNumber(totals.valid)} tone="success" hint="Son los que se muestran en el ranking público." />
        <KpiCard label="En cuarentena" value={formatNumber(totals.suspect)} tone="warning" hint="Sospechosos pendientes de revisión." />
        <KpiCard label="Duplicados bloqueados" value={formatNumber(totals.duplicate_attempts)} tone="accent" hint="Intentos de votar dos veces el mismo plato." />
        <KpiCard label="Limitados por red" value={formatNumber(totals.rate_limited_attempts)} tone="danger" hint="Intentos frenados por exceso desde una misma IP." />
      </div>

      <p className="mt-4 text-sm text-fg-muted">
        El conteo público solo incluye votos <span className="text-emerald-700 dark:text-emerald-300">válidos</span>. Los votos en cuarentena no suman hasta que un
        administrador los apruebe en{" "}
        <Link href="/admin/votos" className="text-brand-text underline-offset-2 hover:underline">
          Votos sospechosos
        </Link>
        ; los rechazados nunca cuentan.
      </p>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Platos</h2>
          <LinkButton href="/admin/platos" variant="ghost" size="sm">
            Gestionar platos
          </LinkButton>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="Todavía no hay platos"
            description="Crea el primer plato para que aparezca en el ranking y empiece a recibir votos."
            action={<LinkButton href="/admin/platos/nuevo">Nuevo plato</LinkButton>}
          />
        ) : (
          <Table minWidth="760px">
            <thead>
              <tr>
                <Th>Plato</Th>
                {admin ? <Th>Restaurante</Th> : null}
                <Th className="text-right">Válidos</Th>
                <Th className="text-right">Sospechosos</Th>
                <Th className="text-right">Rechazados</Th>
                <Th className="text-right">Duplicados</Th>
                <Th className="text-right">Limitados</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ dish, stats: s }) => (
                <tr key={dish.id} className="hover:bg-soft">
                  <Td>
                    <Link href={`/admin/platos/${dish.id}`} className="flex items-center gap-3">
                      <Thumb src={dish.image_url} alt="" size={40} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{dish.name}</span>
                        <span className="block truncate text-xs text-fg-subtle">{dish.inspired_by}</span>
                      </span>
                    </Link>
                  </Td>
                  {admin ? <Td className="text-fg-muted">{dish.restaurant.name}</Td> : null}
                  <Td className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatNumber(s.valid)}</Td>
                  <Td className="text-right tabular-nums text-amber-700 dark:text-amber-300">{formatNumber(s.suspect)}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{formatNumber(s.rejected)}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{formatNumber(s.duplicate_attempts)}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{formatNumber(s.rate_limited_attempts)}</Td>
                  <Td>
                    <Badge tone={dish.is_published ? "success" : "neutral"}>{dish.is_published ? "Publicado" : "Borrador"}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}

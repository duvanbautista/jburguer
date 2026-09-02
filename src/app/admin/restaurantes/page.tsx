import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatNumber } from "@/components/admin/format";
import { Badge, EmptyState, GlassCard, LinkButton, PageHeader, Table, Td, Th, Thumb } from "@/components/admin/ui";
import { ProfileAssign } from "@/components/admin/profile-assign";
import { assignProfile } from "../actions";

export const metadata: Metadata = { title: "Restaurantes" };

export default async function RestaurantsPage() {
  const session = await requireAdmin();
  const db = await getDb();
  const [restaurants, dishes, profiles] = await Promise.all([db.listRestaurants(), db.listDishes(), db.listProfiles()]);

  const dishCount = new Map<string, number>();
  for (const d of dishes) dishCount.set(d.restaurant_id, (dishCount.get(d.restaurant_id) ?? 0) + 1);

  const accounts = new Map<string, string[]>();
  for (const p of profiles) {
    if (p.restaurant_id) accounts.set(p.restaurant_id, [...(accounts.get(p.restaurant_id) ?? []), p.email]);
  }

  const sorted = [...restaurants].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const restaurantOptions = sorted.map((r) => ({ id: r.id, name: r.name }));
  const sortedProfiles = [...profiles].sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));

  return (
    <>
      <PageHeader
        title="Restaurantes"
        description="Participantes del festival y las cuentas que gestionan sus platos."
        actions={
          <LinkButton href="/admin/restaurantes/nuevo">
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo restaurante
          </LinkButton>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          title="Todavía no hay restaurantes"
          description="Crea el primer restaurante participante y luego asígnale una cuenta."
          action={<LinkButton href="/admin/restaurantes/nuevo">Nuevo restaurante</LinkButton>}
        />
      ) : (
        <Table minWidth="760px">
          <thead>
            <tr>
              <Th>Restaurante</Th>
              <Th>Ciudad</Th>
              <Th>Instagram</Th>
              <Th className="text-right">Platos</Th>
              <Th>Cuentas</Th>
              <Th className="text-right">
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const emails = accounts.get(r.id) ?? [];
              return (
                <tr key={r.id} className="hover:bg-soft">
                  <Td>
                    <Link href={`/admin/restaurantes/${r.id}`} className="flex items-center gap-3">
                      <Thumb src={r.logo_url} alt="" size={40} className="rounded-full" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{r.name}</span>
                        <span className="block truncate font-mono text-[11px] text-fg-subtle">{r.slug}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{r.city}</Td>
                  <Td className="text-fg-muted">{r.instagram ? `@${r.instagram}` : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(dishCount.get(r.id) ?? 0)}</Td>
                  <Td>
                    {emails.length === 0 ? (
                      <Badge tone="warning">Sin cuenta</Badge>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {emails.map((e) => (
                          <Badge key={e} tone="neutral" title={e}>
                            {e}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <LinkButton href={`/admin/restaurantes/${r.id}`} variant="secondary" size="sm">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </LinkButton>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <section className="mt-10">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-fg">Cuentas y accesos</h2>
          <p className="text-sm text-fg-subtle">
            Asigna a cada cuenta su rol y el restaurante que gestiona. Una cuenta de restaurante solo ve sus platos y sus votos.
          </p>
        </div>
        <GlassCard className="p-0">
          <ProfileAssign profiles={sortedProfiles} restaurants={restaurantOptions} currentUserId={session.user.id} action={assignProfile} />
        </GlassCard>
      </section>
    </>
  );
}

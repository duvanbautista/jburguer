import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { VoteAttempt, VoteStatus } from "@/lib/types";
import { isAdmin, ownRestaurantId, restaurantScope } from "@/components/admin/scope";
import {
  formatDate,
  formatNumber,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  reasonLabel,
  riskTone,
  shortUa,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/components/admin/format";
import { Badge, Button, EmptyState, Field, GlassCard, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/admin/ui";
import { NoRestaurant } from "@/components/admin/no-restaurant";
import { VoteReviewForm } from "@/components/admin/vote-review";
import { reviewVote } from "../actions";

export const metadata: Metadata = { title: "Votos sospechosos" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isVoteStatus(v: string | undefined): v is VoteStatus {
  return v === "valid" || v === "suspect" || v === "rejected";
}

function YesNo({ value }: { value: boolean }) {
  return <Badge tone={value ? "success" : "neutral"}>{value ? "sí" : "no"}</Badge>;
}

function Reasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <Badge key={r} tone="neutral" title={r}>
          {reasonLabel(r)}
        </Badge>
      ))}
    </span>
  );
}

export default async function VotesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await requireSession();
  const admin = isAdmin(session);
  if (!admin && !ownRestaurantId(session)) return <NoRestaurant />;

  const db = await getDb();
  const scope = restaurantScope(session);
  const dishes = (await db.listDishes(scope)).sort((a, b) => a.name.localeCompare(b.name, "es"));

  const statusParam = first(sp.status);
  const status = isVoteStatus(statusParam) ? statusParam : undefined;
  const dishParam = first(sp.dish);
  // Solo se acepta un plato que el usuario puede ver (evita filtrar por platos ajenos).
  const dishId = dishParam && dishes.some((d) => d.id === dishParam) ? dishParam : undefined;

  const [votes, attempts] = await Promise.all([
    db.listVotes({ status, dishId, restaurantId: scope?.restaurantId, limit: 200 }),
    admin ? db.listAttempts({ limit: 50 }) : Promise.resolve<VoteAttempt[]>([]),
  ]);

  const dishName = new Map(dishes.map((d) => [d.id, d.name]));
  const nameOf = (id: string) => dishName.get(id) ?? "Plato eliminado";
  const suspectCount = votes.filter((v) => v.status === "suspect").length;
  const filtered = Boolean(status || dishId);

  return (
    <>
      <PageHeader
        title="Votos sospechosos"
        description="Los votos en cuarentena no suman al ranking hasta que un administrador los apruebe. Un voto rechazado nunca cuenta y deja de bloquear a ese votante."
        actions={suspectCount > 0 ? <Badge tone="warning">{formatNumber(suspectCount)} en cuarentena en esta vista</Badge> : null}
      />

      <GlassCard className="mb-6 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Estado" htmlFor="status" className="min-w-40">
            <Select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Todos</option>
              <option value="suspect">Sospechosos</option>
              <option value="valid">Válidos</option>
              <option value="rejected">Rechazados</option>
            </Select>
          </Field>
          <Field label="Plato" htmlFor="dish" className="min-w-56">
            <Select id="dish" name="dish" defaultValue={dishId ?? ""}>
              <option value="">Todos</option>
              {dishes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {admin ? ` · ${d.restaurant.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
          {filtered ? (
            <LinkButton href="/admin/votos" variant="ghost">
              Limpiar
            </LinkButton>
          ) : null}
        </form>
      </GlassCard>

      {votes.length === 0 ? (
        <EmptyState
          title={filtered ? "No hay votos con esos filtros" : "Todavía no hay votos registrados"}
          description={filtered ? "Prueba con otro estado u otro plato." : "Cuando el público empiece a votar, aquí verás cada voto con sus señales de riesgo."}
        />
      ) : (
        <Table minWidth={admin ? "1180px" : "960px"}>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Plato</Th>
              <Th>Estado</Th>
              <Th className="text-right">Riesgo</Th>
              <Th>Razones</Th>
              <Th>País</Th>
              <Th>Navegador</Th>
              <Th>Cookie</Th>
              <Th>Storage</Th>
              {admin ? <Th>Revisión</Th> : null}
            </tr>
          </thead>
          <tbody>
            {votes.map((v) => (
              <tr key={v.id} className="align-top hover:bg-soft">
                <Td className="whitespace-nowrap text-fg-muted">{formatDate(v.created_at)}</Td>
                <Td className="font-medium text-fg">{nameOf(v.dish_id)}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                  {v.review_note ? <p className="mt-1 max-w-48 text-xs text-fg-subtle">Nota: {v.review_note}</p> : null}
                </Td>
                <Td className="text-right">
                  <Badge tone={riskTone(v.risk_score)} className="tabular-nums">
                    {v.risk_score}
                  </Badge>
                </Td>
                <Td className="max-w-64">
                  <Reasons reasons={v.reasons} />
                </Td>
                <Td className="text-fg-muted">{v.country ?? "—"}</Td>
                <Td className="text-fg-muted" title={v.ua ?? undefined}>
                  {shortUa(v.ua)}
                </Td>
                <Td>
                  <YesNo value={v.cookie_id !== null} />
                </Td>
                <Td>
                  <YesNo value={v.storage_id !== null} />
                </Td>
                {admin ? (
                  <Td>{v.status === "suspect" ? <VoteReviewForm voteId={v.id} action={reviewVote} /> : <span className="text-fg-subtle">—</span>}</Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {admin ? (
        <section className="mt-10">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-fg">Últimos intentos</h2>
            <p className="text-sm text-fg-subtle">
              Auditoría de los últimos 50 intentos de voto, incluidos los bloqueados por duplicado, red o reto inválido.
            </p>
          </div>
          {attempts.length === 0 ? (
            <EmptyState title="Sin intentos registrados" description="Cada intento de voto, exitoso o no, quedará trazado aquí." />
          ) : (
            <Table minWidth="720px">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Plato</Th>
                  <Th>Resultado</Th>
                  <Th className="text-right">Riesgo</Th>
                  <Th>Razones</Th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-soft">
                    <Td className="whitespace-nowrap text-fg-muted">{formatDate(a.created_at)}</Td>
                    <Td className="text-fg">{nameOf(a.dish_id)}</Td>
                    <Td>
                      <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
                    </Td>
                    <Td className="text-right">
                      <Badge tone={riskTone(a.risk_score)} className="tabular-nums">
                        {a.risk_score}
                      </Badge>
                    </Td>
                    <Td className="max-w-72">
                      <Reasons reasons={a.reasons} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      ) : null}
    </>
  );
}

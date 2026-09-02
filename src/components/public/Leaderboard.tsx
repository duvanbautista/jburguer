"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat } from "lucide-react";
import type { DishWithRestaurant } from "@/lib/types";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";
import { DishCard } from "./DishCard";
import { LiveBadge } from "./LiveBadge";
import type { DishRowPatch } from "./schemas";
import type { PublicSettings } from "./types";
import { useLiveDishUpdates } from "./useLiveDishUpdates";

interface Props {
  initialDishes: DishWithRestaurant[];
  settings: PublicSettings;
}

/** Orden del ranking: más votos primero; empate por nombre. */
function sortDishes(list: DishWithRestaurant[]): DishWithRestaurant[] {
  return [...list].sort(
    (a, b) => b.votes_count - a.votes_count || a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
}

function applyPatch(dish: DishWithRestaurant, patch: DishRowPatch): DishWithRestaurant {
  return {
    ...dish,
    votes_count: patch.votes_count ?? dish.votes_count,
    name: patch.name ?? dish.name,
    inspired_by: patch.inspired_by ?? dish.inspired_by,
    image_url: patch.image_url === undefined ? dish.image_url : patch.image_url,
  };
}

/* En escritorio el #1 va en el centro y más alto; #2 a la izquierda, #3 a la derecha. */
const podiumOrder = ["md:order-2 md:-translate-y-6", "md:order-1", "md:order-3"];

/**
 * Ranking en vivo. Recibe el estado inicial del servidor y lo mantiene
 * actualizado por Realtime (Supabase) o polling (modo demo).
 */
export function Leaderboard({ initialDishes, settings }: Props) {
  const [dishes, setDishes] = useState(() => sortDishes(initialDishes));
  // Espejos en refs para leerlos desde callbacks asíncronos sin re-suscribir.
  const dishesRef = useRef(dishes);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    dishesRef.current = dishes;
  }, [dishes]);

  const onPatch = useCallback((patch: DishRowPatch) => {
    const known = dishesRef.current.some((d) => d.id === patch.id);
    if (!known) {
      // Plato recién publicado: no tenemos su restaurante, pedimos la lista completa.
      if (patch.is_published !== false) void refreshRef.current();
      return;
    }
    setDishes((prev) => {
      if (patch.is_published === false) return prev.filter((d) => d.id !== patch.id);
      return sortDishes(prev.map((d) => (d.id === patch.id ? applyPatch(d, patch) : d)));
    });
  }, []);

  const onSnapshot = useCallback((list: DishWithRestaurant[]) => {
    setDishes(sortDishes(list));
  }, []);

  const { mode, refresh } = useLiveDishUpdates({ onPatch, onSnapshot });
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const podium = dishes.slice(0, 3);
  const votingOpen = settings.voting_open;

  return (
    <>
      <section
        id="podio"
        aria-labelledby="podio-title"
        className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">Los favoritos del público</p>
            <h2 id="podio-title" className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              Podio
            </h2>
          </div>
          <LiveBadge mode={mode} />
        </div>

        {podium.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="grid gap-5 md:grid-cols-3 md:items-end md:pt-6">
            {podium.map((dish, i) => (
              <li key={dish.id} className={cn("animate-fade-in", podiumOrder[i])}>
                <DishCard dish={dish} rank={i + 1} variant="podium" votingOpen={votingOpen} priority />
              </li>
            ))}
          </ol>
        )}
      </section>

      {dishes.length > 0 && (
        <section
          id="ranking"
          aria-labelledby="ranking-title"
          className="mx-auto mt-16 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">Todos los platos</p>
              <h2 id="ranking-title" className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                Ranking completo
              </h2>
            </div>
            <p className="text-sm text-fg-muted">
              {dishes.length} {dishes.length === 1 ? "plato" : "platos"} · ordenados por votos
            </p>
          </div>

          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dishes.map((dish, i) => (
              <li key={dish.id}>
                {/* La primera fila suele quedar above the fold: carga prioritaria. */}
                <DishCard dish={dish} rank={i + 1} votingOpen={votingOpen} priority={i < 4} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <GlassCard className="flex flex-col items-center gap-3 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand/15 text-brand">
        <ChefHat className="size-7" aria-hidden />
      </span>
      <h3 className="text-xl font-bold">Aún no hay platos publicados</h3>
      <p className="max-w-md text-sm text-fg-muted">
        Los restaurantes están afinando sus recetas. Vuelve pronto: el ranking se actualiza en vivo.
      </p>
    </GlassCard>
  );
}

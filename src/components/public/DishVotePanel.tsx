"use client";

import { useCallback, useState } from "react";
import { Heart } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";
import { LiveBadge } from "./LiveBadge";
import type { DishRowPatch } from "./schemas";
import { useLiveDishUpdates } from "./useLiveDishUpdates";
import { VoteButton } from "./VoteButton";
import { VoteCount } from "./VoteCount";

interface Props {
  dishId: string;
  dishName: string;
  initialVotes: number;
  votingOpen: boolean;
  className?: string;
}

/** Contador de votos en vivo + botón de voto de la página del plato. */
export function DishVotePanel({ dishId, dishName, initialVotes, votingOpen, className }: Props) {
  const [votes, setVotes] = useState(initialVotes);

  const onPatch = useCallback(
    (patch: DishRowPatch) => {
      if (patch.id === dishId && typeof patch.votes_count === "number") setVotes(patch.votes_count);
    },
    [dishId],
  );
  const { mode } = useLiveDishUpdates({ dishId, onPatch });

  return (
    <GlassCard tone="dark" className={cn("relative overflow-hidden", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-brand/20 blur-3xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted">Votos del público</p>
          <p className="mt-1 flex items-center gap-3 text-5xl font-black tracking-tight sm:text-6xl">
            <Heart className="size-9 fill-brand text-brand sm:size-10" aria-hidden />
            <VoteCount value={votes} />
            <span className="sr-only">votos</span>
          </p>
        </div>
        <LiveBadge mode={mode} />
      </div>

      <VoteButton
        dishId={dishId}
        dishName={dishName}
        votingOpen={votingOpen}
        onVoted={setVotes}
        className="relative mt-6"
      />
    </GlassCard>
  );
}

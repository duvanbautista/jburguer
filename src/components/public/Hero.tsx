import { ArrowDown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import type { PublicSettings } from "./types";

interface Props {
  settings: PublicSettings;
  dishCount: number;
}

/** Portada: edición, nombre del festival y tagline (todo desde `settings`). */
export function Hero({ settings, dishCount }: Props) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-8 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
      <Badge tone="brand" className="animate-fade-in">
        <Sparkles className="size-3.5" aria-hidden />
        {settings.edition}
      </Badge>

      <h1 className="mt-6 text-5xl font-black tracking-tight text-balance sm:text-6xl lg:text-7xl">
        <span className="text-brand-gradient">{settings.festival_name}</span>
      </h1>

      <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted text-pretty sm:text-xl">
        {settings.tagline}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Badge tone={settings.voting_open ? "green" : "red"} size="md">
          <span
            aria-hidden
            className={settings.voting_open ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-danger"}
          />
          {settings.voting_open ? "Votación abierta" : "Votación cerrada"}
        </Badge>
        <Badge tone="glass" size="md">
          {dishCount} {dishCount === 1 ? "plato" : "platos"} en competencia
        </Badge>
        <ButtonLink href="#ranking" variant="secondary" size="sm" aria-label="Ir al ranking completo">
          Ver ranking
          <ArrowDown className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { ArrowLeft, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata: Metadata = { title: "No encontrado" };

export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
      <GlassCard className="flex max-w-lg flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-brand/15 text-brand">
          <SearchX className="size-8" aria-hidden />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">Error 404</p>
        <h1 className="text-3xl font-black tracking-tight">Este plato no está en la carta</h1>
        <p className="text-fg-muted">
          La página que buscas no existe o el plato ya no está publicado. Vuelve al ranking y elige otro favorito.
        </p>
        <ButtonLink href="/" className="mt-2">
          <ArrowLeft className="size-4" aria-hidden />
          Todos los platos
        </ButtonLink>
      </GlassCard>
    </main>
  );
}

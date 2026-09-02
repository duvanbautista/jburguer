"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";

const formatter = new Intl.NumberFormat("es-CO");

/**
 * Número de votos con animación "pop" cuando sube.
 * Usa el patrón de React de ajustar estado durante el render (sin efectos).
 */
export function VoteCount({ value, className }: { value: number; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [bump, setBump] = useState(0);

  if (value !== prev) {
    setPrev(value);
    if (value > prev) setBump(bump + 1);
  }

  return (
    <span
      // Cambiar la key reinicia la animación en cada subida.
      key={bump}
      className={cn("inline-block tabular-nums", bump > 0 && "animate-pop", className)}
    >
      {formatter.format(value)}
    </span>
  );
}

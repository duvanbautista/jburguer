import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "brand" | "gold" | "glass" | "green" | "red" | "neutral";
export type BadgeSize = "sm" | "md";

const tones: Record<BadgeTone, string> = {
  brand: "bg-brand/15 text-brand-text border-brand/30",
  gold: "bg-gold/15 text-amber-700 border-gold/30 dark:text-gold",
  glass: "bg-soft text-fg/80 border-line backdrop-blur",
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  red: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  neutral: "bg-soft-2 text-fg border-line-strong",
};

const sizes: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px] gap-1",
  md: "px-3 py-1 text-xs gap-1.5",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  children?: ReactNode;
}

/** Etiqueta pequeña en mayúsculas con borde. Genérica, sin datos. */
export function Badge({ tone = "glass", size = "md", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-wider",
        tones[tone],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

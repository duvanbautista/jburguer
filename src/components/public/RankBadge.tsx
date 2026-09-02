import { Crown, Medal } from "lucide-react";
import { cn } from "@/components/ui/cn";

/**
 * Posición en el ranking: corona para #1, medallas para #2 y #3, número para el resto.
 * Va sobre la foto de la viñeta: oro/plata/bronce son colores fijos de medalla y
 * el numeral #4+ usa vidrio oscuro (glass-photo) en ambos temas.
 */
export function RankBadge({ rank, size = "md", className }: { rank: number; size?: "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "h-11 min-w-11 px-3 text-base" : "h-8 min-w-8 px-2 text-sm";
  const icon = size === "lg" ? "size-5" : "size-4";
  const label = `Puesto ${rank}`;

  if (rank === 1) {
    return (
      <span
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-full bg-linear-to-br from-gold to-brand font-black text-black shadow-[0_0_24px_rgb(255_210_63/0.45)]",
          dims,
          className,
        )}
      >
        <Crown className={icon} aria-hidden />
        <span>1</span>
      </span>
    );
  }

  if (rank === 2 || rank === 3) {
    const tone =
      rank === 2
        ? "from-zinc-200 to-zinc-400 text-zinc-900"
        : "from-amber-600 to-amber-800 text-white";
    return (
      <span
        aria-label={label}
        title={label}
        className={cn("inline-flex items-center justify-center gap-1 rounded-full bg-linear-to-br font-black", tone, dims, className)}
      >
        <Medal className={icon} aria-hidden />
        <span>{rank}</span>
      </span>
    );
  }

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "glass-photo inline-flex items-center justify-center rounded-full font-bold",
        dims,
        className,
      )}
    >
      #{rank}
    </span>
  );
}

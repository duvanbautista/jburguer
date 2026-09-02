import { cn } from "@/components/ui/cn";
import type { LiveMode } from "./useLiveDishUpdates";

const labels: Record<LiveMode, string> = {
  connecting: "Conectando",
  realtime: "En vivo",
  polling: "En vivo",
};

/** Indicador "En vivo" con punto verde pulsante. */
export function LiveBadge({ mode, className }: { mode: LiveMode; className?: string }) {
  const live = mode !== "connecting";
  return (
    <span
      role="status"
      aria-live="polite"
      title={mode === "realtime" ? "Actualización en tiempo real" : mode === "polling" ? "Actualización cada 8 segundos" : "Conectando"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-fg/80 backdrop-blur",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          live ? "bg-success animate-pulse-dot" : "bg-amber-500 animate-pulse",
        )}
      />
      {labels[mode]}
    </span>
  );
}

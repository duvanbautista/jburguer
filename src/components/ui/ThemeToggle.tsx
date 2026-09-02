"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Selector de tema con tres estados: automático (sistema), claro y oscuro.
 *
 * - Persiste en localStorage bajo THEME_STORAGE_KEY (definida en src/lib/theme.ts,
 *   fuera de este módulo cliente, para que el layout de servidor pueda leerla).
 * - Aplica <html data-theme="light|dark">; en modo automático quita el atributo
 *   y las media queries de globals.css deciden.
 * - El script inline de src/app/layout.tsx aplica el valor guardado ANTES del
 *   primer pintado, así no hay parpadeo al cargar.
 */
export type ThemeMode = "system" | "light" | "dark";

const MODES: Array<{ value: ThemeMode; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Automático", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/* Almacén externo mínimo (useSyncExternalStore): modo actual + suscriptores.
   Todos los ThemeToggle montados (cabecera, pie…) comparten el mismo estado. */
let currentMode: ThemeMode | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getMode(): ThemeMode {
  if (currentMode === null) currentMode = readStoredMode();
  return currentMode;
}

// En el servidor y durante la hidratación siempre "system"/no montado, para que
// servidor y cliente rendericen lo mismo; React re-renderiza con el valor real
// nada más hidratar (sin parpadeo del botón activo).
const getServerMode = (): ThemeMode => "system";
const getMounted = () => true;
const getServerMounted = () => false;

export function applyThemeMode(mode: ThemeMode) {
  currentMode = mode;
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* almacenamiento bloqueado: el tema aplica solo en esta vista */
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode);
  const mounted = useSyncExternalStore(subscribe, getMounted, getServerMounted);

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className={`inline-flex items-center gap-0.5 rounded-full border border-line bg-soft p-0.5 ${className}`}
      data-mounted={mounted ? "true" : "false"}
    >
      {MODES.map(({ value, label, Icon }) => {
        const active = mounted && mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => applyThemeMode(value)}
            aria-pressed={active}
            aria-label={`Tema ${label.toLowerCase()}`}
            title={label}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors",
              active ? "bg-brand text-white shadow-glow" : "text-fg-muted hover:bg-soft-2 hover:text-fg",
              compact ? "" : "sm:px-2.5",
            ].join(" ")}
          >
            <Icon className="size-3.5" aria-hidden />
            {!compact && <span className="hidden sm:inline">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

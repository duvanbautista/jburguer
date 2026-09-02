"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { DishWithRestaurant } from "@/lib/types";
import { DishResponseSchema, DishRowPatchSchema, DishesResponseSchema, type DishRowPatch } from "./schemas";

export type LiveMode = "connecting" | "realtime" | "polling";

interface Options {
  /** Si se indica, solo interesa ese plato (página de detalle). */
  dishId?: string;
  /** Cambio parcial de un plato (Realtime o snapshot de un solo plato). */
  onPatch: (patch: DishRowPatch) => void;
  /** Lista completa (solo en modo polling de la lista). */
  onSnapshot?: (dishes: DishWithRestaurant[]) => void;
  /** Intervalo de polling cuando no hay Supabase (por defecto 8 s). */
  intervalMs?: number;
}

/**
 * Mantiene los contadores al día:
 *  - con Supabase: suscripción a `postgres_changes` (UPDATE en public.dishes);
 *    si el canal falla, cae a polling.
 *  - sin Supabase (modo demo): polling a /api/dishes o /api/dishes/[id].
 * Devuelve el modo activo y una función para forzar un refresco.
 */
export function useLiveDishUpdates({ dishId, onPatch, onSnapshot, intervalMs = 8000 }: Options) {
  const [mode, setMode] = useState<LiveMode>("connecting");
  // Últimos callbacks sin re-suscribir el canal en cada render.
  const patchRef = useRef(onPatch);
  const snapshotRef = useRef(onSnapshot);
  useEffect(() => {
    patchRef.current = onPatch;
    snapshotRef.current = onSnapshot;
  }, [onPatch, onSnapshot]);

  const refresh = useCallback(async () => {
    try {
      const url = dishId ? `/api/dishes/${encodeURIComponent(dishId)}` : "/api/dishes";
      const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const json: unknown = await res.json();
      if (dishId) {
        const parsed = DishResponseSchema.safeParse(json);
        if (parsed.success) patchRef.current(parsed.data.dish);
      } else {
        const parsed = DishesResponseSchema.safeParse(json);
        if (parsed.success) snapshotRef.current?.(parsed.data.dishes);
      }
    } catch {
      /* red caída: se reintenta en el siguiente tick */
    }
  }, [dishId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const startPolling = () => {
      if (timer || disposed) return;
      setMode("polling");
      timer = setInterval(() => void refresh(), intervalMs);
      document.addEventListener("visibilitychange", onVisible);
    };

    const supabase = createBrowserSupabase();
    if (!supabase) {
      startPolling();
      return () => {
        disposed = true;
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    const channel = supabase
      .channel(`dishes-live-${dishId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dishes",
          ...(dishId ? { filter: `id=eq.${dishId}` } : {}),
        },
        (payload) => {
          const parsed = DishRowPatchSchema.safeParse(payload.new);
          if (parsed.success) patchRef.current(parsed.data);
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setMode("realtime");
          // Al reconectar puede haber cambios perdidos: sincroniza una vez.
          void refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          startPolling();
        }
      });

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [dishId, intervalMs, refresh]);

  return { mode, refresh };
}

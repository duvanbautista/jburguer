"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleCheck,
  Clock,
  Heart,
  Lock,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { collectFingerprint } from "@/lib/fingerprint/client";
import type { ChallengeRequest, ClientFingerprint, VoteRequest } from "@/lib/types";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ChallengeResponseSchema, VoteResponseSchema } from "./schemas";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/**
 * El servidor exige ≥ 1,5 s entre el reto y el voto y suma riesgo (`too_fast`)
 * si se responde en < 3 s: armamos el botón pasados 3 s para que un clic humano
 * desde la interfaz nunca dispare esa señal.
 */
const MIN_CHALLENGE_AGE_MS = 3100;
/** Tiempo máximo esperando el token de Turnstile antes de rendirse. */
const TOKEN_WAIT_MS = 8000;

type Phase =
  | "idle"
  | "loading-fp"
  | "ready"
  | "submitting"
  | "voted"
  | "suspect"
  | "already"
  | "rate_limited"
  | "closed"
  | "error";

interface Challenge {
  token: string;
  receivedAt: number;
  ttlMs: number;
}

type ChallengeResult =
  | { kind: "ok"; challenge: Challenge; alreadyVoted: boolean; votingOpen: boolean }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      appearance?: "always" | "execute" | "interaction-only";
      theme?: "light" | "dark" | "auto";
    },
  ): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

/** Acceso tipado al objeto global que inyecta el script de Turnstile. */
function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  const maybe: unknown = (window as unknown as { turnstile?: unknown }).turnstile;
  if (typeof maybe === "object" && maybe !== null && "render" in maybe && "reset" in maybe) {
    return maybe as TurnstileApi;
  }
  return undefined;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const OFFLINE_MESSAGE = "Sin conexión. Revisa tu red e intenta de nuevo.";

async function fetchChallenge(dishId: string, fp: ClientFingerprint): Promise<ChallengeResult> {
  try {
    const body: ChallengeRequest = { dishId, fp };
    const res = await fetch("/api/vote/challenge", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "error", message: "No pudimos preparar tu voto. Intenta de nuevo." };
    const json: unknown = await res.json();
    const parsed = ChallengeResponseSchema.safeParse(json);
    if (!parsed.success) return { kind: "error", message: "Respuesta inesperada del servidor." };
    return {
      kind: "ok",
      challenge: { token: parsed.data.challenge, receivedAt: Date.now(), ttlMs: parsed.data.ttl * 1000 },
      alreadyVoted: parsed.data.alreadyVoted,
      votingOpen: parsed.data.votingOpen,
    };
  } catch {
    return { kind: "error", message: OFFLINE_MESSAGE };
  }
}

async function safeCollectFingerprint(): Promise<ClientFingerprint> {
  try {
    return await collectFingerprint();
  } catch {
    // El recolector promete no lanzar; por si acaso, enviamos una huella vacía.
    return { components: {}, storageId: null, version: 0 };
  }
}

interface Props {
  dishId: string;
  dishName: string;
  /** Si la votación ya está cerrada según el servidor, se muestra sin esperar al reto. */
  votingOpen?: boolean;
  /** Nuevo `votes_count` devuelto por la API tras votar. */
  onVoted?: (votesCount: number) => void;
  className?: string;
}

/**
 * Botón de voto: huella → reto firmado → voto. Los estados cubren todos los
 * códigos de la API. Si hay NEXT_PUBLIC_TURNSTILE_SITE_KEY carga el widget
 * de Turnstile (modo "interaction-only") y envía su token.
 */
export function VoteButton({ dishId, dishName, votingOpen = true, onVoted, className }: Props) {
  const [phase, setPhase] = useState<Phase>(votingOpen ? "idle" : "closed");
  const [message, setMessage] = useState<string | null>(null);
  /** true cuando ya pasó el tiempo mínimo desde el reto. */
  const [armed, setArmed] = useState(false);

  const fpRef = useRef<ClientFingerprint | null>(null);
  const challengeRef = useRef<Challenge | null>(null);
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const widgetElRef = useRef<HTMLDivElement>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const arm = useCallback(() => {
    setArmed(false);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current) setArmed(true);
    }, MIN_CHALLENGE_AGE_MS);
  }, []);

  /* ── Turnstile (opcional) ── */
  const mountTurnstile = useCallback(() => {
    const ts = getTurnstile();
    const el = widgetElRef.current;
    if (!TURNSTILE_SITE_KEY || !ts || !el || widgetIdRef.current) return;
    widgetIdRef.current = ts.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      appearance: "interaction-only",
      callback: (token) => {
        tokenRef.current = token;
      },
      "expired-callback": () => {
        tokenRef.current = null;
      },
      "error-callback": () => {
        tokenRef.current = null;
      },
    });
  }, []);

  const resetTurnstile = useCallback(() => {
    tokenRef.current = null;
    const ts = getTurnstile();
    if (ts && widgetIdRef.current) {
      try {
        ts.reset(widgetIdRef.current);
      } catch {
        /* el widget pudo ser retirado */
      }
    }
  }, []);

  useEffect(() => {
    mountTurnstile();
    return () => {
      const ts = getTurnstile();
      if (ts && widgetIdRef.current) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {
          /* ignorar */
        }
      }
      widgetIdRef.current = null;
    };
  }, [mountTurnstile]);

  const waitForToken = useCallback(async (): Promise<string | null> => {
    const started = Date.now();
    while (!tokenRef.current) {
      if (Date.now() - started > TOKEN_WAIT_MS || cancelledRef.current) return null;
      await sleep(150);
    }
    return tokenRef.current;
  }, []);

  /* ── Preparación: huella + reto ──
     No cambia estado de forma síncrona: el estado inicial ("idle") ya
     representa "preparando"; el reintento lo ajusta desde el evento. */
  const prepare = useCallback(async () => {
    const fp = fpRef.current ?? (await safeCollectFingerprint());
    if (cancelledRef.current) return;
    fpRef.current = fp;

    const result = await fetchChallenge(dishId, fp);
    if (cancelledRef.current) return;

    if (result.kind === "not_found") {
      setPhase("error");
      setMessage("Este plato ya no está disponible.");
      return;
    }
    if (result.kind === "error") {
      setPhase("error");
      setMessage(result.message);
      return;
    }

    challengeRef.current = result.challenge;
    if (!result.votingOpen) {
      setPhase("closed");
      return;
    }
    if (result.alreadyVoted) {
      setPhase("already");
      return;
    }
    setPhase("ready");
    arm();
  }, [dishId, arm]);

  useEffect(() => {
    cancelledRef.current = false;
    void prepare();
    return () => {
      cancelledRef.current = true;
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, [prepare]);

  /* ── Envío del voto ── */
  const submit = useCallback(async () => {
    const fp = fpRef.current;
    if (!fp) return;
    setPhase("submitting");
    setMessage(null);

    let challenge = challengeRef.current;
    const expired = !challenge || Date.now() - challenge.receivedAt > challenge.ttlMs - 5000;
    if (!challenge || expired) {
      const renewed = await fetchChallenge(dishId, fp);
      if (cancelledRef.current) return;
      if (renewed.kind === "not_found") {
        setPhase("error");
        setMessage("Este plato ya no está disponible.");
        return;
      }
      if (renewed.kind === "error") {
        setPhase("error");
        setMessage(renewed.message);
        return;
      }
      if (!renewed.votingOpen) {
        setPhase("closed");
        return;
      }
      if (renewed.alreadyVoted) {
        setPhase("already");
        return;
      }
      challenge = renewed.challenge;
      challengeRef.current = challenge;
    }

    // Respetar la edad mínima del reto que exige el servidor.
    const age = Date.now() - challenge.receivedAt;
    if (age < MIN_CHALLENGE_AGE_MS) await sleep(MIN_CHALLENGE_AGE_MS - age);

    let turnstileToken: string | undefined;
    if (TURNSTILE_SITE_KEY) {
      const token = await waitForToken();
      if (cancelledRef.current) return;
      if (!token) {
        resetTurnstile();
        setPhase("ready");
        setArmed(true);
        setMessage("No pudimos completar la verificación anti-bots. Intenta de nuevo.");
        return;
      }
      turnstileToken = token;
    }

    const body: VoteRequest = { challenge: challenge.token, fp, ...(turnstileToken ? { turnstileToken } : {}) };
    let res: Response;
    try {
      res = await fetch(`/api/dishes/${encodeURIComponent(dishId)}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      if (cancelledRef.current) return;
      setPhase("error");
      setMessage(OFFLINE_MESSAGE);
      return;
    }
    if (cancelledRef.current) return;

    // El token de Turnstile es de un solo uso.
    if (TURNSTILE_SITE_KEY) resetTurnstile();

    const json: unknown = await res.json().catch(() => null);
    const parsed = VoteResponseSchema.safeParse(json);
    if (!parsed.success) {
      setPhase("error");
      setMessage(`Respuesta inesperada del servidor (${res.status}).`);
      return;
    }

    const data = parsed.data;
    if (data.ok) {
      onVoted?.(data.votes_count);
      setPhase(data.status === "valid" ? "voted" : "suspect");
      return;
    }

    switch (data.code) {
      case "ALREADY_VOTED":
        setPhase("already");
        break;
      case "RATE_LIMITED":
        setPhase("rate_limited");
        break;
      case "VOTING_CLOSED":
        setPhase("closed");
        break;
      case "BAD_CHALLENGE": {
        // Reto inválido o vencido: se renueva y se pide un nuevo clic.
        challengeRef.current = null;
        const renewed = await fetchChallenge(dishId, fp);
        if (cancelledRef.current) return;
        if (renewed.kind === "ok") challengeRef.current = renewed.challenge;
        setPhase("ready");
        setMessage("Tu sesión de voto se renovó. Pulsa de nuevo para votar.");
        arm();
        break;
      }
      case "CAPTCHA_REQUIRED":
      case "CAPTCHA_FAILED":
        setPhase("ready");
        setArmed(true);
        setMessage("La verificación anti-bots no pasó. Intenta de nuevo.");
        break;
      case "DISH_NOT_FOUND":
        setPhase("error");
        setMessage("Este plato ya no está disponible.");
        break;
      default:
        setPhase("error");
        setMessage(data.message || "No pudimos registrar tu voto.");
    }
  }, [dishId, arm, onVoted, resetTurnstile, waitForToken]);

  /* ── Presentación ── */
  const busy = phase === "idle" || phase === "loading-fp" || phase === "submitting";
  const final = phase === "voted" || phase === "suspect" || phase === "already" || phase === "closed" || phase === "rate_limited";
  const disabled = busy || final || (phase === "ready" && !armed);

  const variant: ButtonVariant =
    phase === "voted" ? "primary" : phase === "ready" || busy ? "primary" : "secondary";

  const labels: Record<Phase, string> = {
    idle: "Preparando tu voto…",
    "loading-fp": "Preparando tu voto…",
    ready: armed ? `Votar por ${dishName}` : "Un momento…",
    submitting: "Enviando tu voto…",
    voted: "¡Voto registrado!",
    suspect: "Voto recibido",
    already: "Ya votaste por este plato",
    rate_limited: "Demasiados votos desde tu red",
    closed: "Votación cerrada",
    error: "Reintentar",
  };

  const statusText: Partial<Record<Phase, string>> = {
    voted: "¡Gracias! Tu voto ya cuenta en el ranking.",
    suspect: "Voto recibido. Está en revisión por nuestro sistema antifraude.",
    already: "Solo se permite un voto por dispositivo para cada plato.",
    rate_limited: "Demasiados votos desde tu red. Intenta más tarde.",
    closed: "La votación está cerrada en este momento.",
  };

  const icon = (() => {
    const c = "size-5";
    switch (phase) {
      case "voted":
        return <Heart className={cn(c, "fill-current animate-heart-burst")} aria-hidden />;
      case "suspect":
        return <ShieldAlert className={c} aria-hidden />;
      case "already":
        return <Check className={c} aria-hidden />;
      case "closed":
        return <Lock className={c} aria-hidden />;
      case "rate_limited":
        return <Clock className={c} aria-hidden />;
      case "error":
        return <RotateCcw className={c} aria-hidden />;
      case "ready":
        return armed ? <Heart className={c} aria-hidden /> : null;
      default:
        return null;
    }
  })();

  const retry = () => {
    setPhase("loading-fp");
    setMessage(null);
    setArmed(false);
    void prepare();
  };
  const onClick = phase === "error" ? retry : () => void submit();
  const secondary = statusText[phase] ?? message;
  const secondaryTone =
    phase === "voted"
      ? "text-success"
      : phase === "suspect"
        ? "text-amber-700 dark:text-amber-300"
        : phase === "error" || phase === "rate_limited"
          ? "text-danger"
          : "text-fg-muted";

  return (
    <div className={cn("relative", className)}>
      {TURNSTILE_SITE_KEY && <Script src={TURNSTILE_SRC} strategy="afterInteractive" onReady={mountTurnstile} />}

      <div className="relative inline-flex w-full sm:w-auto">
        <Button
          size="lg"
          variant={variant}
          loading={busy}
          disabled={disabled}
          onClick={onClick}
          aria-label={phase === "ready" && armed ? `Votar por ${dishName}` : labels[phase]}
          className={cn(
            "w-full min-w-64 sm:w-auto",
            // Los estados finales se muestran a plena opacidad aunque el botón esté deshabilitado.
            final && "disabled:opacity-100",
            phase === "voted" && "from-emerald-500 to-emerald-700 shadow-[0_0_0_1px_rgb(16_185_129/0.5),0_14px_44px_-10px_rgb(16_185_129/0.6)]",
          )}
        >
          {icon}
          {labels[phase]}
        </Button>
        {phase === "voted" && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-xl font-black text-gold animate-float-up"
          >
            +1
          </span>
        )}
      </div>

      <p role="status" aria-live="polite" className={cn("mt-3 min-h-5 text-sm", secondaryTone)}>
        {phase === "error" && <TriangleAlert className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />}
        {phase === "suspect" && <CircleCheck className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />}
        {secondary}
      </p>

      <p className="mt-2 text-xs text-fg-subtle">
        Un voto por dispositivo. Validamos dispositivo y red, no hace falta cuenta.
      </p>

      {/* Contenedor del widget de Turnstile (vacío si no está configurado). */}
      <div ref={widgetElRef} className="mt-3 empty:hidden" />
    </div>
  );
}

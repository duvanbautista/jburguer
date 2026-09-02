import type { AttemptOutcome, VoteStatus } from "@/lib/types";
import type { BadgeTone } from "./ui";

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

/** Fecha corta en hora de Colombia. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

/** Resume un user-agent largo en "Navegador · SO" (o el cliente HTTP detectado). */
export function shortUa(ua: string | null): string {
  if (!ua) return "—";
  const s = ua.toLowerCase();
  if (s.includes("curl")) return "curl";
  if (s.includes("python-requests")) return "python-requests";
  if (s.includes("headlesschrome")) return "HeadlessChrome";
  if (s.includes("bot") || s.includes("spider")) return "Bot";

  let os = "";
  if (s.includes("android")) os = "Android";
  else if (s.includes("iphone")) os = "iPhone";
  else if (s.includes("ipad")) os = "iPad";
  else if (s.includes("windows")) os = "Windows";
  else if (s.includes("mac os")) os = "macOS";
  else if (s.includes("linux")) os = "Linux";

  let browser = "";
  if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("opr/")) browser = "Opera";
  else if (s.includes("samsungbrowser")) browser = "Samsung";
  else if (s.includes("firefox")) browser = "Firefox";
  else if (s.includes("chrome")) browser = "Chrome";
  else if (s.includes("safari")) browser = "Safari";

  if (!browser && !os) return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
  return [browser, os].filter(Boolean).join(" · ");
}

export function riskTone(score: number): BadgeTone {
  if (score >= 60) return "danger";
  if (score >= 30) return "warning";
  return "success";
}

export const STATUS_LABEL: Record<VoteStatus, string> = {
  valid: "Válido",
  suspect: "Sospechoso",
  rejected: "Rechazado",
};

export const STATUS_TONE: Record<VoteStatus, BadgeTone> = {
  valid: "success",
  suspect: "warning",
  rejected: "danger",
};

export const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  accepted: "Aceptado",
  suspect: "Cuarentena",
  duplicate: "Duplicado",
  rate_limited: "Limitado por red",
  bad_challenge: "Reto inválido",
  voting_closed: "Votación cerrada",
  rejected: "Rechazado",
};

export const OUTCOME_TONE: Record<AttemptOutcome, BadgeTone> = {
  accepted: "success",
  suspect: "warning",
  duplicate: "accent",
  rate_limited: "danger",
  bad_challenge: "info",
  voting_closed: "neutral",
  rejected: "danger",
};

/** Etiquetas cortas para las razones del motor antifraude (ver src/lib/antifraud/engine.ts). */
const REASON_LABEL: Record<string, string> = {
  cookie: "cookie repetida",
  storage: "storage repetido",
  "device+headers": "mismo dispositivo y cabeceras",
  device: "mismo dispositivo",
  device_match: "dispositivo coincide",
  ip_shared: "IP compartida",
  ip_burst: "ráfaga por IP",
  subnet_burst: "ráfaga por subred",
  voter_retry: "reintentos",
  weak_fp: "huella débil",
  bot_ua: "UA de bot",
  fp_version: "recolector desconocido",
  too_fast: "demasiado rápido",
  no_cookie: "sin cookie",
  no_storage: "sin storage",
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

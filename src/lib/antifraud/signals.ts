/**
 * Derivación de señales en servidor a partir de cabeceras + huella del cliente.
 * El cliente envía componentes crudos; aquí se normalizan y se hashean con
 * HMAC(VOTE_SECRET). Nunca se devuelven IPs ni huellas en claro.
 */
import type { ClientFingerprint } from "@/lib/types";
import {
  CLIENT_EXTRA_COMPONENT_KEYS,
  DEVICE_COMPONENT_KEYS,
  FP_VERSION,
} from "@/lib/fingerprint/components";
import { getVoteSecret, hmac, stableStringify } from "./hash";

export interface FpQuality {
  hasCanvas: boolean;
  hasWebgl: boolean;
  versionOk: boolean;
}

export interface Signals {
  /** hmac(device_fp | server_fp): identidad principal. */
  voterKey: string;
  deviceFp: string;
  clientFp: string;
  serverFp: string;
  ipHash: string;
  subnetHash: string;
  country: string | null;
  ua: string | null;
  cookieId: string | null;
  storageId: string | null;
  fpQuality: FpQuality;
  botUa: boolean;
}

export interface DeriveSignalsInput {
  headers: Headers;
  fp: ClientFingerprint;
  cookieId: string | null;
}

const BOT_UA_RE = /curl|wget|python|httpclient|headless|bot|spider|scrapy|postman|insomnia|go-http|java\//i;
const UA_MAX_LEN = 512;
const UNKNOWN_IP = "0.0.0.0";

/* ───────────── IP y subred ───────────── */

/** IP del cliente en claro (solo para uso interno, p. ej. Turnstile). */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const raw = first || headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "";
  return normalizeIp(raw) ?? UNKNOWN_IP;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Limpia corchetes, puertos y el prefijo IPv4-mapeado de IPv6. */
export function normalizeIp(raw: string): string | null {
  let ip = raw.trim();
  if (!ip) return null;
  // "[::1]:1234" o "[2001:db8::1]"
  const bracket = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) ip = bracket[1];
  // "1.2.3.4:1234"
  const v4port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4port) ip = v4port[1];
  // "::ffff:1.2.3.4"
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) ip = mapped[1];
  ip = ip.toLowerCase();
  if (IPV4_RE.test(ip)) {
    const ok = ip.split(".").every((o) => Number(o) <= 255);
    return ok ? ip : null;
  }
  if (ip.includes(":") && /^[0-9a-f:.]+$/.test(ip)) return ip;
  return null;
}

/** Subred: /24 para IPv4, /64 para IPv6. Para IPs desconocidas devuelve "0.0.0.0/24". */
export function subnetOf(ip: string): string {
  const v4 = ip.match(IPV4_RE);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  const hextets = expandIpv6(ip);
  if (hextets) return `${hextets.slice(0, 4).join(":")}::/64`;
  return `${UNKNOWN_IP}/24`;
}

/** Expande una IPv6 (con "::" y/o cola IPv4) a 8 hextets de 4 dígitos; null si es inválida. */
export function expandIpv6(ip: string): string[] | null {
  let addr = ip.toLowerCase();
  // Cola IPv4 embebida (p. ej. "::ffff:1.2.3.4").
  const tail = addr.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(1, 5).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    const hex = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    addr = addr.slice(0, addr.length - tail[0].length) + `${hex(a, b)}:${hex(c, d)}`;
  }
  const doubleColon = addr.split("::");
  if (doubleColon.length > 2) return null;
  const compressed = doubleColon.length === 2;
  const head = doubleColon[0] ? doubleColon[0].split(":") : [];
  const rest = compressed && doubleColon[1] ? doubleColon[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (compressed ? missing < 0 : missing !== 0) return null;
  const filler = compressed ? Array.from({ length: missing }, () => "0") : [];
  const parts = [...head, ...filler, ...rest];
  if (parts.length !== 8 || parts.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return parts.map((p) => p.padStart(4, "0"));
}

/* ───────────── Normalización de componentes ───────────── */

type ComponentValue = string | number | boolean | null;

function normalizeValue(v: unknown): ComponentValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s.length > 0 ? s : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  return null;
}

function pick(components: ClientFingerprint["components"], keys: readonly string[]): Record<string, ComponentValue> {
  const out: Record<string, ComponentValue> = {};
  for (const k of keys) out[k] = normalizeValue(components[k]);
  return out;
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function headerOrEmpty(headers: Headers, name: string): string {
  return headers.get(name)?.trim() ?? "";
}

/* ───────────── Derivación ───────────── */

export function deriveSignals({ headers, fp, cookieId }: DeriveSignalsInput): Signals {
  const secret = getVoteSecret();
  const components = fp.components ?? {};

  const deviceComponents = pick(components, DEVICE_COMPONENT_KEYS);
  const clientComponents = { ...deviceComponents, ...pick(components, CLIENT_EXTRA_COMPONENT_KEYS) };

  const deviceFp = hmac(secret, "device", stableStringify(deviceComponents));
  const clientFp = hmac(secret, "client", stableStringify(clientComponents));

  const uaHeader = headerOrEmpty(headers, "user-agent");
  const serverFp = hmac(
    secret,
    "server",
    uaHeader,
    headerOrEmpty(headers, "accept-language"),
    headerOrEmpty(headers, "sec-ch-ua"),
    headerOrEmpty(headers, "sec-ch-ua-platform"),
    headerOrEmpty(headers, "sec-ch-ua-mobile"),
  );
  const voterKey = hmac(secret, "voter", `${deviceFp}|${serverFp}`);

  const ip = getClientIp(headers);
  const ipHash = hmac(secret, "ip", ip);
  const subnetHash = hmac(secret, "subnet", subnetOf(ip));

  const countryRaw = (headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;

  const storageId = typeof fp.storageId === "string" && fp.storageId.trim() ? fp.storageId.trim() : null;

  return {
    voterKey,
    deviceFp,
    clientFp,
    serverFp,
    ipHash,
    subnetHash,
    country,
    ua: uaHeader ? uaHeader.slice(0, UA_MAX_LEN) : null,
    cookieId: cookieId ?? null,
    storageId,
    fpQuality: {
      hasCanvas: nonEmptyString(components.canvas),
      hasWebgl: nonEmptyString(components.webglRenderer) || nonEmptyString(components.webglVendor),
      versionOk: fp.version === FP_VERSION,
    },
    botUa: isBotUa(uaHeader),
  };
}

/** true para clientes HTTP, navegadores headless, bots o UA vacío. */
export function isBotUa(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  return s.length === 0 || BOT_UA_RE.test(s);
}

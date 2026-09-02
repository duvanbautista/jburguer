/**
 * Recolector de huella del navegador. SOLO debe importarse desde componentes
 * cliente. Nunca lanza: cada componente se recoge en su propio try/catch y, si
 * falla, vale null. Se resuelve en menos de 1 s (presupuesto interno de 900 ms).
 *
 * Idempotente: la primera llamada se memoriza para que el challenge y el voto
 * envíen exactamente la misma huella (misma voter_key en servidor).
 */
import type { ClientFingerprint } from "@/lib/types";
import { FP_VERSION } from "./components";

type ComponentValue = string | number | boolean | null;
type Components = Record<string, ComponentValue>;

const TOTAL_BUDGET_MS = 900;
const AUDIO_TIMEOUT_MS = 300;
const STORAGE_READ_TIMEOUT_MS = 350;
const STORAGE_WRITE_TIMEOUT_MS = 250;

const STORAGE_KEY = "bl_sid";
const IDB_NAME = "bl";
const IDB_STORE = "kv";
const IDB_KEY = "sid";
const CACHE_NAME = "bl";
const CACHE_REQUEST = "/__bl_sid";

const UUIDISH_RE = /^[0-9a-f-]{8,64}$/i;

let memo: Promise<ClientFingerprint> | null = null;

function emptyFingerprint(): ClientFingerprint {
  return { components: {}, storageId: null, version: FP_VERSION };
}

/** Recoge la huella. Nunca lanza; en SSR devuelve una huella vacía. */
export async function collectFingerprint(): Promise<ClientFingerprint> {
  if (typeof window === "undefined" || typeof document === "undefined") return emptyFingerprint();
  if (!memo) {
    memo = collect().catch(() => emptyFingerprint());
  }
  return memo;
}

/* ───────────── Utilidades ───────────── */

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function safeSync<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

async function safeAsync<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Hash cyrb53 (53 bits) como respaldo cuando SubtleCrypto no está disponible (http sin localhost). */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return cyrb53(input);
}

/* ───────────── Componentes ───────────── */

async function canvasComponent(): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 260;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f60";
  ctx.fillRect(110, 2, 70, 22);
  ctx.fillStyle = "#069";
  ctx.font = "14px Arial";
  ctx.fillText("Burger Liga 🍔 ñáé, <canvas> 1.0", 2, 16);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.font = "18px 'Times New Roman'";
  ctx.fillText("Burger Liga 🍔 ñáé", 4, 46);

  const gradient = ctx.createLinearGradient(0, 0, 260, 0);
  gradient.addColorStop(0, "#ff0");
  gradient.addColorStop(0.5, "#f0f");
  gradient.addColorStop(1, "#0ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 56, 260, 12);

  ctx.globalCompositeOperation = "multiply";
  const circles: Array<[string, number, number]> = [
    ["rgb(255,0,255)", 60, 40],
    ["rgb(0,255,255)", 90, 40],
    ["rgb(255,255,0)", 75, 62],
  ];
  for (const [color, x, y] of circles) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgb(255,0,255)";
  ctx.beginPath();
  ctx.arc(200, 45, 30, 0, Math.PI * 2, true);
  ctx.arc(200, 45, 12, 0, Math.PI * 2, true);
  ctx.fill("evenodd");

  return sha256Hex(canvas.toDataURL());
}

function webglComponents(): { vendor: string | null; renderer: string | null } {
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return { vendor: null, renderer: null };
  const asString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  if (debug) {
    const vendor = asString(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL));
    const renderer = asString(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    if (vendor || renderer) return { vendor, renderer };
  }
  return { vendor: asString(gl.getParameter(gl.VENDOR)), renderer: asString(gl.getParameter(gl.RENDERER)) };
}

const FONT_CANDIDATES = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Helvetica Neue",
  "Impact",
  "Lucida Console",
  "Menlo",
  "Monaco",
  "Noto Sans",
  "Palatino Linotype",
  "Roboto",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Ubuntu",
  "Verdana",
];
const FONT_BASES = ["monospace", "sans-serif", "serif"];

/** Fuentes instaladas: se detecta comparando anchos de texto contra las familias genéricas. */
function fontsComponent(): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sample = "mmmmmmmmmmlli🍔WwQq0O";
  const measure = (family: string): number => {
    ctx.font = `72px ${family}`;
    return ctx.measureText(sample).width;
  };
  const baseline = FONT_BASES.map(measure);
  const detected = FONT_CANDIDATES.filter((font) =>
    FONT_BASES.some((base, i) => measure(`"${font}", ${base}`) !== baseline[i]),
  );
  return detected.join(",");
}

function audioComponent(): Promise<number | null> {
  const w = window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Ctx = window.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctx) return Promise.resolve(null);
  const ctx = new Ctx(1, 5000, 44100);
  const oscillator = ctx.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.value = 10000;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 40;
  compressor.ratio.value = 12;
  compressor.attack.value = 0;
  compressor.release.value = 0.25;
  oscillator.connect(compressor);
  compressor.connect(ctx.destination);
  oscillator.start(0);
  return ctx.startRendering().then((buffer) => {
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < data.length; i++) sum += Math.abs(data[i]);
    return Math.round(sum * 1000) / 1000;
  });
}

function platformComponent(): string | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.platform || null;
}

function colorGamutComponent(): string | null {
  for (const gamut of ["rec2020", "p3", "srgb"]) {
    if (window.matchMedia(`(color-gamut: ${gamut})`).matches) return gamut;
  }
  return null;
}

function syncComponents(): Components {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    screenWidth: safeSync(() => screen.width) ?? null,
    screenHeight: safeSync(() => screen.height) ?? null,
    colorDepth: safeSync(() => screen.colorDepth) ?? null,
    dpr: safeSync(() => window.devicePixelRatio) ?? null,
    cores: safeSync(() => navigator.hardwareConcurrency) ?? null,
    memory: safeSync(() => nav.deviceMemory ?? null),
    platform: safeSync(platformComponent),
    touch: safeSync(() => navigator.maxTouchPoints) ?? null,
    timezone: safeSync(() => Intl.DateTimeFormat().resolvedOptions().timeZone) ?? null,
    languages: safeSync(() => (navigator.languages?.length ? navigator.languages : [navigator.language]).join(",")),
    ua: safeSync(() => navigator.userAgent) ?? null,
    fonts: safeSync(fontsComponent),
    reducedMotion: safeSync(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    colorGamut: safeSync(colorGamutComponent),
  };
}

/* ───────────── storageId redundante ───────────── */

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function readLocal(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}
function writeLocal(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open falló"));
    req.onblocked = () => reject(new Error("indexedDB bloqueada"));
  });
}

async function readIdb(): Promise<string | null> {
  const db = await openIdb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => reject(req.error ?? new Error("get falló"));
    });
  } finally {
    db.close();
  }
}

async function writeIdb(id: string): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(id, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("put falló"));
      tx.onabort = () => reject(tx.error ?? new Error("transacción abortada"));
    });
  } finally {
    db.close();
  }
}

async function readCache(): Promise<string | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(CACHE_REQUEST);
  if (!res) return null;
  const text = (await res.text()).trim();
  return text || null;
}

async function writeCache(id: string): Promise<void> {
  if (!("caches" in window)) throw new Error("Cache API no disponible");
  const cache = await caches.open(CACHE_NAME);
  await cache.put(CACHE_REQUEST, new Response(id, { headers: { "content-type": "text/plain" } }));
}

function validId(v: string | null): string | null {
  return v && UUIDISH_RE.test(v) ? v : null;
}

/**
 * Lee el id de los tres almacenes; usa el primero que exista y lo restaura en
 * los demás. Si no existe en ninguno, genera uno y lo guarda en los tres.
 * Devuelve null solo si no se pudo leer ni escribir en ninguno.
 */
async function resolveStorageId(): Promise<string | null> {
  const [fromLocal, fromIdb, fromCache] = await Promise.all([
    Promise.resolve(safeSync(readLocal)),
    withTimeout(safeAsync(readIdb), STORAGE_READ_TIMEOUT_MS, null),
    withTimeout(safeAsync(readCache), STORAGE_READ_TIMEOUT_MS, null),
  ]);
  const found = validId(fromLocal) ?? validId(fromIdb) ?? validId(fromCache);
  const id = found ?? generateId();

  const writes: Array<Promise<boolean>> = [];
  if (fromLocal !== id) writes.push(Promise.resolve(safeSync(() => (writeLocal(id), true)) ?? false));
  if (fromIdb !== id) writes.push(withTimeout(safeAsync(() => writeIdb(id).then(() => true)), STORAGE_WRITE_TIMEOUT_MS, false).then(Boolean));
  if (fromCache !== id) writes.push(withTimeout(safeAsync(() => writeCache(id).then(() => true)), STORAGE_WRITE_TIMEOUT_MS, false).then(Boolean));
  const results = await Promise.all(writes);

  if (found) return found;
  return results.some(Boolean) ? id : null;
}

/* ───────────── Recolección ───────────── */

async function collect(): Promise<ClientFingerprint> {
  const components: Components = { ...syncComponents() };
  components.canvas = null;
  components.webglVendor = null;
  components.webglRenderer = null;
  components.audio = null;

  const webgl = safeSync(webglComponents);
  if (webgl) {
    components.webglVendor = webgl.vendor;
    components.webglRenderer = webgl.renderer;
  }

  let storageId: string | null = null;
  const tasks: Array<Promise<void>> = [
    safeAsync(canvasComponent).then((v) => {
      components.canvas = v;
    }),
    withTimeout(safeAsync(audioComponent), AUDIO_TIMEOUT_MS, null).then((v) => {
      components.audio = v;
    }),
    safeAsync(resolveStorageId).then((v) => {
      storageId = v;
    }),
  ];

  // Presupuesto total: lo que no haya terminado se queda en null.
  await withTimeout(Promise.all(tasks).then(() => undefined), TOTAL_BUDGET_MS, undefined);

  return { components, storageId, version: FP_VERSION };
}

/**
 * Implementación de Db en memoria para el modo demo (sin credenciales de Supabase).
 *
 *  - Se siembra desde src/lib/seed-data.ts (restaurantes, platos, ajustes,
 *    perfiles demo y votos sintéticos 'valid' de las últimas 48 h).
 *  - Replica la semántica de los índices únicos parciales de Postgres
 *    (dish_id + voter_key / cookie_id / storage_id, ignorando 'rejected')
 *    lanzando UniqueViolationError.
 *  - El estado vive en globalThis para sobrevivir al HMR de `next dev`.
 *  - uploadImage escribe en public/uploads/<bucketPath> y devuelve /uploads/<bucketPath>.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Dish,
  DishStats,
  DishWithRestaurant,
  Profile,
  Restaurant,
  Settings,
  Vote,
  VoteAttempt,
} from "@/lib/types";
import { SEED_DISHES, SEED_RESTAURANTS, SEED_SETTINGS } from "@/lib/seed-data";
import { demoAdminEmail, demoUserId } from "./demo-ids";
import { generateDemoVotes } from "./demo-votes";
import {
  UniqueViolationError,
  type Db,
  type DishInput,
  type ExistingVoteLookup,
  type ExistingVoteMatch,
  type NewAttempt,
  type NewVote,
  type RestaurantInput,
  type VoteHistory,
} from "./types";

interface State {
  restaurants: Map<string, Restaurant>;
  dishes: Map<string, Dish>;
  votes: Map<string, Vote>;
  attempts: VoteAttempt[];
  settings: Settings;
  profiles: Map<string, Profile>;
}

export interface MemoryDbOptions {
  /** true => estado propio (no compartido en globalThis). Útil en pruebas. */
  isolated?: boolean;
  /** false => sin restaurantes/platos/votos/perfiles (solo ajustes). Por defecto true. */
  seed?: boolean;
}

const g = globalThis as typeof globalThis & { __blMemory?: State };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ───────────────────────────── Siembra ───────────────────────────── */

function buildState(seed: boolean): State {
  const state: State = {
    restaurants: new Map(),
    dishes: new Map(),
    votes: new Map(),
    attempts: [],
    settings: { id: 1, ...SEED_SETTINGS, updated_at: new Date().toISOString() },
    profiles: new Map(),
  };
  if (!seed) return state;

  // Fechas fijas para que la UI sea estable entre reinicios.
  const base = Date.parse("2026-08-01T12:00:00.000Z");

  const adminEmail = demoAdminEmail();
  const adminId = demoUserId(adminEmail);
  state.profiles.set(adminId, {
    id: adminId,
    email: adminEmail,
    role: "admin",
    restaurant_id: null,
    created_at: new Date(base).toISOString(),
  });

  SEED_RESTAURANTS.forEach((r, i) => {
    const ownerId = demoUserId(r.email);
    state.restaurants.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      description: r.description,
      logo_url: null,
      instagram: r.instagram,
      owner_id: ownerId,
      created_at: new Date(base + i * MIN).toISOString(),
    });
    state.profiles.set(ownerId, {
      id: ownerId,
      email: r.email,
      role: "restaurant",
      restaurant_id: r.id,
      created_at: new Date(base + i * MIN).toISOString(),
    });
  });

  const now = Date.now();
  SEED_DISHES.forEach((d, i) => {
    const created = new Date(base + HOUR + i * MIN).toISOString();
    state.dishes.set(d.id, {
      id: d.id,
      restaurant_id: d.restaurant_id,
      name: d.name,
      inspired_by: d.inspired_by,
      story: d.story,
      ingredients: [...d.ingredients],
      image_url: d.image,
      is_published: d.is_published,
      votes_count: 0,
      created_at: created,
      updated_at: created,
    });
    const { votes, attempts } = generateDemoVotes(d.id, d.demo_votes, now);
    for (const v of votes) state.votes.set(randomUUID(), { ...v, id: "" });
    for (const a of attempts) state.attempts.push({ ...a, id: randomUUID() });
  });
  // Asigna el id real a cada voto (la clave del Map es el id).
  for (const [id, v] of state.votes) v.id = id;
  for (const d of state.dishes.values()) recount(state, d.id);

  return state;
}

/* ───────────────────────────── Utilidades ───────────────────────────── */

function recount(state: State, dishId: string): void {
  const dish = state.dishes.get(dishId);
  if (!dish) return;
  let n = 0;
  for (const v of state.votes.values()) if (v.dish_id === dishId && v.status === "valid") n++;
  dish.votes_count = n;
}

function cloneVote(v: Vote): Vote {
  return { ...v, reasons: [...v.reasons] };
}

function cloneAttempt(a: VoteAttempt): VoteAttempt {
  return { ...a, reasons: [...a.reasons] };
}

function cloneDish(d: Dish): Dish {
  return { ...d, ingredients: [...d.ingredients] };
}

function withRestaurant(state: State, d: Dish): DishWithRestaurant {
  const r = state.restaurants.get(d.restaurant_id);
  if (!r) throw new Error(`Plato ${d.id} sin restaurante (${d.restaurant_id})`);
  return {
    ...cloneDish(d),
    restaurant: { id: r.id, slug: r.slug, name: r.name, city: r.city, logo_url: r.logo_url, instagram: r.instagram },
  };
}

/** votes_count desc, luego más antiguo primero (orden estable para el ranking). */
function byRanking(a: Dish, b: Dish): number {
  return b.votes_count - a.votes_count || a.created_at.localeCompare(b.created_at);
}

function byNewest<T extends { created_at: string }>(a: T, b: T): number {
  return b.created_at.localeCompare(a.created_at);
}

function assertSlugFree(state: State, slug: string, exceptId?: string): void {
  for (const r of state.restaurants.values()) {
    if (r.slug === slug && r.id !== exceptId) throw new Error(`Ya existe un restaurante con el slug "${slug}"`);
  }
}

function safeBucketPath(bucketPath: string): string {
  const safe = bucketPath
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!safe) throw new Error("bucketPath inválido");
  return safe;
}

/** Añade public/uploads/ al .gitignore del proyecto si aún no está. */
async function ensureUploadsIgnored(): Promise<void> {
  const file = path.join(process.cwd(), ".gitignore");
  try {
    const current = await readFile(file, "utf8").catch(() => "");
    if (/^\/?public\/uploads\/?\s*$/m.test(current)) return;
    const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
    await appendFile(file, `${sep}\n# Subidas locales (modo demo en memoria)\n/public/uploads/\n`);
  } catch {
    // Sin permisos de escritura: no es crítico para el demo.
  }
}

/* ───────────────────────────── Fábrica ───────────────────────────── */

export function createMemoryDb(options: MemoryDbOptions = {}): Db {
  const seed = options.seed ?? true;
  let state: State;
  if (options.isolated) {
    state = buildState(seed);
  } else {
    if (!g.__blMemory) g.__blMemory = buildState(seed);
    state = g.__blMemory;
  }

  const db: Db = {
    kind: "memory",

    /* ── Público ── */
    async listPublishedDishes() {
      return [...state.dishes.values()]
        .filter((d) => d.is_published)
        .sort(byRanking)
        .map((d) => withRestaurant(state, d));
    },

    async getPublishedDish(id) {
      const d = state.dishes.get(id);
      return d && d.is_published ? withRestaurant(state, d) : null;
    },

    async getSettings() {
      return { ...state.settings };
    },

    /* ── Votación ── */
    async findExistingVote(q: ExistingVoteLookup) {
      let best: ExistingVoteMatch | null = null;
      let bestRank = Infinity;
      const candidates = [...state.votes.values()]
        .filter((v) => v.dish_id === q.dishId && v.status !== "rejected")
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (const v of candidates) {
        const matchedBy: ExistingVoteMatch["matchedBy"] = [];
        if (q.cookieId && v.cookie_id === q.cookieId) matchedBy.push("cookie_id");
        if (q.storageId && v.storage_id === q.storageId) matchedBy.push("storage_id");
        if (v.voter_key === q.voterKey) matchedBy.push("voter_key");
        if (v.device_fp === q.deviceFp) matchedBy.push("device_fp");
        if (matchedBy.length === 0) continue;
        // Prioridad: la señal más fuerte primero (cookie > storage > voter_key > device_fp).
        const rank = matchedBy.indexOf("cookie_id") >= 0 ? 0 : matchedBy.indexOf("storage_id") >= 0 ? 1 : matchedBy.indexOf("voter_key") >= 0 ? 2 : 3;
        if (rank < bestRank) {
          bestRank = rank;
          best = { vote: cloneVote(v), matchedBy };
          if (rank === 0) break;
        }
      }
      return best;
    },

    async getVoteHistory(q) {
      const now = Date.now();
      const t24h = now - DAY;
      const t1h = now - HOUR;
      const t10m = now - 10 * MIN;
      const h: VoteHistory = { ipVotesDish24h: 0, ipVotesAll10m: 0, subnetVotesDish1h: 0, voterAttempts10m: 0, ipAttempts10m: 0 };
      for (const v of state.votes.values()) {
        if (v.status === "rejected") continue;
        const t = Date.parse(v.created_at);
        if (v.ip_hash === q.ipHash) {
          if (v.dish_id === q.dishId && t >= t24h) h.ipVotesDish24h++;
          if (t >= t10m) h.ipVotesAll10m++;
        }
        if (v.subnet_hash === q.subnetHash && v.dish_id === q.dishId && t >= t1h) h.subnetVotesDish1h++;
      }
      for (const a of state.attempts) {
        const t = Date.parse(a.created_at);
        if (t < t10m) continue;
        if (a.voter_key === q.voterKey) h.voterAttempts10m++;
        if (a.ip_hash === q.ipHash) h.ipAttempts10m++;
      }
      return h;
    },

    async insertVote(v: NewVote) {
      if (!state.dishes.has(v.dish_id)) throw new Error("Plato no encontrado");
      // Índices únicos parciales (status <> 'rejected').
      for (const existing of state.votes.values()) {
        if (existing.dish_id !== v.dish_id || existing.status === "rejected") continue;
        if (existing.voter_key === v.voter_key) throw new UniqueViolationError("voter_key");
        if (v.cookie_id !== null && existing.cookie_id === v.cookie_id) throw new UniqueViolationError("cookie_id");
        if (v.storage_id !== null && existing.storage_id === v.storage_id) throw new UniqueViolationError("storage_id");
      }
      const vote: Vote = {
        ...v,
        reasons: [...v.reasons],
        id: randomUUID(),
        review_note: null,
        created_at: new Date().toISOString(),
      };
      state.votes.set(vote.id, vote);
      if (vote.status === "valid") recount(state, vote.dish_id);
      return cloneVote(vote);
    },

    async logAttempt(a: NewAttempt) {
      state.attempts.push({ ...a, reasons: [...a.reasons], id: randomUUID(), created_at: new Date().toISOString() });
    },

    async getValidVotesCount(dishId) {
      let n = 0;
      for (const v of state.votes.values()) if (v.dish_id === dishId && v.status === "valid") n++;
      return n;
    },

    /* ── Admin: restaurantes ── */
    async listRestaurants() {
      return [...state.restaurants.values()].sort((a, b) => a.name.localeCompare(b.name, "es")).map((r) => ({ ...r }));
    },

    async getRestaurant(id) {
      const r = state.restaurants.get(id);
      return r ? { ...r } : null;
    },

    async createRestaurant(input: RestaurantInput) {
      assertSlugFree(state, input.slug);
      const r: Restaurant = { ...input, id: randomUUID(), created_at: new Date().toISOString() };
      state.restaurants.set(r.id, r);
      return { ...r };
    },

    async updateRestaurant(id, input) {
      const r = state.restaurants.get(id);
      if (!r) throw new Error("Restaurante no encontrado");
      if (input.slug !== undefined) assertSlugFree(state, input.slug, id);
      const next: Restaurant = { ...r, ...input, id: r.id, created_at: r.created_at };
      state.restaurants.set(id, next);
      return { ...next };
    },

    async deleteRestaurant(id) {
      if (!state.restaurants.delete(id)) return;
      // on delete cascade (platos → votos/intentos) y set null (perfiles).
      const dishIds = new Set<string>();
      for (const d of state.dishes.values()) if (d.restaurant_id === id) dishIds.add(d.id);
      for (const dishId of dishIds) state.dishes.delete(dishId);
      for (const [vid, v] of state.votes) if (dishIds.has(v.dish_id)) state.votes.delete(vid);
      state.attempts = state.attempts.filter((a) => !dishIds.has(a.dish_id));
      for (const p of state.profiles.values()) if (p.restaurant_id === id) p.restaurant_id = null;
    },

    /* ── Admin: platos ── */
    async listDishes(filter) {
      return [...state.dishes.values()]
        .filter((d) => !filter?.restaurantId || d.restaurant_id === filter.restaurantId)
        .sort(byRanking)
        .map((d) => withRestaurant(state, d));
    },

    async getDish(id) {
      const d = state.dishes.get(id);
      return d ? withRestaurant(state, d) : null;
    },

    async createDish(input: DishInput) {
      if (!state.restaurants.has(input.restaurant_id)) throw new Error("Restaurante no encontrado");
      const now = new Date().toISOString();
      const d: Dish = { ...input, ingredients: [...input.ingredients], id: randomUUID(), votes_count: 0, created_at: now, updated_at: now };
      state.dishes.set(d.id, d);
      return cloneDish(d);
    },

    async updateDish(id, input) {
      const d = state.dishes.get(id);
      if (!d) throw new Error("Plato no encontrado");
      if (input.restaurant_id !== undefined && !state.restaurants.has(input.restaurant_id)) {
        throw new Error("Restaurante no encontrado");
      }
      const next: Dish = {
        ...d,
        ...input,
        ingredients: input.ingredients ? [...input.ingredients] : d.ingredients,
        id: d.id,
        votes_count: d.votes_count,
        created_at: d.created_at,
        updated_at: new Date().toISOString(),
      };
      state.dishes.set(id, next);
      return cloneDish(next);
    },

    async deleteDish(id) {
      if (!state.dishes.delete(id)) return;
      for (const [vid, v] of state.votes) if (v.dish_id === id) state.votes.delete(vid);
      state.attempts = state.attempts.filter((a) => a.dish_id !== id);
    },

    /* ── Admin: votos y métricas ── */
    async listVotes(filter) {
      const limit = filter.limit ?? 200;
      return [...state.votes.values()]
        .filter((v) => {
          if (filter.dishId && v.dish_id !== filter.dishId) return false;
          if (filter.status && v.status !== filter.status) return false;
          if (filter.restaurantId) {
            const d = state.dishes.get(v.dish_id);
            if (!d || d.restaurant_id !== filter.restaurantId) return false;
          }
          return true;
        })
        .sort(byNewest)
        .slice(0, limit)
        .map(cloneVote);
    },

    async reviewVote(id, status, note) {
      const v = state.votes.get(id);
      if (!v) throw new Error("Voto no encontrado");
      v.status = status;
      v.review_note = note;
      recount(state, v.dish_id);
      return cloneVote(v);
    },

    async getDishStats(filter) {
      const stats = new Map<string, DishStats>();
      for (const d of state.dishes.values()) {
        if (filter?.restaurantId && d.restaurant_id !== filter.restaurantId) continue;
        stats.set(d.id, { dish_id: d.id, valid: 0, suspect: 0, rejected: 0, duplicate_attempts: 0, rate_limited_attempts: 0 });
      }
      for (const v of state.votes.values()) {
        const s = stats.get(v.dish_id);
        if (s) s[v.status]++;
      }
      for (const a of state.attempts) {
        const s = stats.get(a.dish_id);
        if (!s) continue;
        if (a.outcome === "duplicate") s.duplicate_attempts++;
        else if (a.outcome === "rate_limited") s.rate_limited_attempts++;
      }
      return [...stats.values()];
    },

    async listAttempts(filter) {
      const limit = filter.limit ?? 200;
      return state.attempts
        .filter((a) => (!filter.dishId || a.dish_id === filter.dishId) && (!filter.outcome || a.outcome === filter.outcome))
        .sort(byNewest)
        .slice(0, limit)
        .map(cloneAttempt);
    },

    async updateSettings(patch) {
      state.settings = { ...state.settings, ...patch, id: 1, updated_at: new Date().toISOString() };
      return { ...state.settings };
    },

    /* ── Perfiles ── */
    async getProfileByUserId(userId) {
      const p = state.profiles.get(userId);
      return p ? { ...p } : null;
    },

    async listProfiles() {
      return [...state.profiles.values()].sort((a, b) => a.email.localeCompare(b.email)).map((p) => ({ ...p }));
    },

    async upsertProfile(p) {
      const prev = state.profiles.get(p.id);
      const next: Profile = { ...p, created_at: prev?.created_at ?? new Date().toISOString() };
      state.profiles.set(next.id, next);
      return { ...next };
    },

    /* ── Archivos ── */
    async uploadImage({ bucketPath, bytes }) {
      const safe = safeBucketPath(bucketPath);
      const target = path.join(process.cwd(), "public", "uploads", ...safe.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      await ensureUploadsIgnored();
      return { publicUrl: `/uploads/${safe}` };
    },
  };

  return db;
}

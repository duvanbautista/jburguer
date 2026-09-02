/**
 * Implementación de Db sobre Supabase (Postgres + Storage).
 *
 * AUTORIZACIÓN — LEER ANTES DE USAR:
 * Todos los métodos usan el cliente ADMIN (service role), que ignora RLS.
 * Este módulo NO comprueba quién llama. La capa de aplicación (server actions
 * y route handlers) debe verificar sesión y propiedad — requireAdmin(),
 * canManageRestaurant() — ANTES de invocar cualquier método de escritura o
 * de lectura restringida (votos, intentos, perfiles, platos no publicados).
 * Nunca importar desde el cliente: admin.ts lleva `server-only`.
 *
 * Mapeo: restaurants, dishes (+ join restaurants para DishWithRestaurant),
 * votes, vote_attempts, settings (fila id=1), profiles, vista dish_stats y
 * bucket de Storage 'dish-images'.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DishWithRestaurant, Vote } from "@/lib/types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  UniqueViolationError,
  type Db,
  type ExistingVoteMatch,
  type VoteHistory,
} from "./types";

const BUCKET = "dish-images";
const DISH_WITH_RESTAURANT = "*, restaurants:restaurant_id(id,slug,name,city,logo_url,instagram)";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ───────────── Esquemas de fila (validan la respuesta de PostgREST) ───────────── */

const nullableString = z.string().nullable();

const restaurantRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  description: nullableString,
  logo_url: nullableString,
  instagram: nullableString,
  owner_id: nullableString,
  created_at: z.string(),
});

const restaurantEmbed = restaurantRow.pick({
  id: true,
  slug: true,
  name: true,
  city: true,
  logo_url: true,
  instagram: true,
});

const dishRow = z.object({
  id: z.string(),
  restaurant_id: z.string(),
  name: z.string(),
  inspired_by: z.string(),
  story: z.string(),
  ingredients: z.array(z.string()),
  image_url: nullableString,
  is_published: z.boolean(),
  votes_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const dishJoinRow = dishRow.extend({ restaurants: restaurantEmbed });

const voteStatus = z.enum(["valid", "suspect", "rejected"]);

const voteRow = z.object({
  id: z.string(),
  dish_id: z.string(),
  voter_key: z.string(),
  device_fp: z.string(),
  client_fp: z.string(),
  server_fp: z.string(),
  cookie_id: nullableString,
  storage_id: nullableString,
  ip_hash: z.string(),
  subnet_hash: z.string(),
  country: nullableString,
  ua: nullableString,
  risk_score: z.number(),
  reasons: z.array(z.string()),
  status: voteStatus,
  review_note: nullableString,
  created_at: z.string(),
});

const attemptRow = z.object({
  id: z.string(),
  dish_id: z.string(),
  voter_key: z.string(),
  ip_hash: z.string(),
  outcome: z.enum(["accepted", "suspect", "duplicate", "rate_limited", "bad_challenge", "voting_closed", "rejected"]),
  reasons: z.array(z.string()),
  risk_score: z.number(),
  created_at: z.string(),
});

const settingsRow = z.object({
  id: z.number(),
  festival_name: z.string(),
  edition: z.string(),
  tagline: z.string(),
  voting_open: z.boolean(),
  ip_soft_limit: z.number(),
  ip_hard_limit: z.number(),
  strict_device_match: z.boolean(),
  suspect_threshold: z.number(),
  updated_at: z.string(),
});

const profileRow = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["admin", "restaurant"]),
  restaurant_id: nullableString,
  created_at: z.string(),
});

// Los count() de la vista llegan como bigint → número o string según el driver.
const statsRow = z.object({
  dish_id: z.string(),
  valid: z.coerce.number(),
  suspect: z.coerce.number(),
  rejected: z.coerce.number(),
  duplicate_attempts: z.coerce.number(),
  rate_limited_attempts: z.coerce.number(),
});

/* ───────────── Utilidades ───────────── */

function fail(ctx: string, error: PostgrestError | { message: string }): never {
  const details = "details" in error && error.details ? ` (${error.details})` : "";
  throw new Error(`[db:supabase] ${ctx}: ${error.message}${details}`);
}

/** PGRST116 = .single() sin filas. */
function isNoRows(error: PostgrestError): boolean {
  return error.code === "PGRST116";
}

/** Deduce el campo del índice único violado a partir del nombre del constraint. */
function uniqueField(error: PostgrestError): UniqueViolationError["field"] {
  const text = `${error.message} ${error.details ?? ""}`;
  if (text.includes("votes_dish_voter_key_uq")) return "voter_key";
  if (text.includes("votes_dish_cookie_uq")) return "cookie_id";
  if (text.includes("votes_dish_storage_uq")) return "storage_id";
  return "unknown";
}

/** Valor seguro para filtros .or() de PostgREST (entre comillas, sin comillas internas). */
function orValue(v: string): string {
  return `"${v.replace(/["\\]/g, "")}"`;
}

function toDishWithRestaurant(row: z.infer<typeof dishJoinRow>): DishWithRestaurant {
  const { restaurants, ...dish } = row;
  return { ...dish, restaurant: restaurants };
}

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

type CountResult = PromiseLike<{ count: number | null; error: PostgrestError | null }>;

async function countRows(ctx: string, query: CountResult): Promise<number> {
  const { count, error } = await query;
  if (error) fail(ctx, error);
  return count ?? 0;
}

/** Elige el voto previo más relevante: cookie > storage > voter_key > device_fp; empate → más antiguo. */
function pickBestMatch(votes: Vote[], q: { voterKey: string; deviceFp: string; cookieId: string | null; storageId: string | null }): ExistingVoteMatch | null {
  let best: ExistingVoteMatch | null = null;
  let bestRank = Infinity;
  for (const v of votes) {
    const matchedBy: ExistingVoteMatch["matchedBy"] = [];
    if (q.cookieId && v.cookie_id === q.cookieId) matchedBy.push("cookie_id");
    if (q.storageId && v.storage_id === q.storageId) matchedBy.push("storage_id");
    if (v.voter_key === q.voterKey) matchedBy.push("voter_key");
    if (v.device_fp === q.deviceFp) matchedBy.push("device_fp");
    if (matchedBy.length === 0) continue;
    const rank = matchedBy.includes("cookie_id") ? 0 : matchedBy.includes("storage_id") ? 1 : matchedBy.includes("voter_key") ? 2 : 3;
    if (rank < bestRank) {
      bestRank = rank;
      best = { vote: v, matchedBy };
      if (rank === 0) break;
    }
  }
  return best;
}

/* ───────────── Fábrica ───────────── */

export function createSupabaseDb(client?: SupabaseClient): Db {
  const sb = client ?? createAdminSupabase();

  const db: Db = {
    kind: "supabase",

    /* ── Público ── */
    async listPublishedDishes() {
      const { data, error } = await sb
        .from("dishes")
        .select(DISH_WITH_RESTAURANT)
        .eq("is_published", true)
        .order("votes_count", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) fail("listPublishedDishes", error);
      return z.array(dishJoinRow).parse(data).map(toDishWithRestaurant);
    },

    async getPublishedDish(id) {
      const { data, error } = await sb
        .from("dishes")
        .select(DISH_WITH_RESTAURANT)
        .eq("id", id)
        .eq("is_published", true)
        .maybeSingle();
      if (error) fail("getPublishedDish", error);
      return data ? toDishWithRestaurant(dishJoinRow.parse(data)) : null;
    },

    async getSettings() {
      const { data, error } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
      if (error) fail("getSettings", error);
      if (!data) throw new Error("[db:supabase] Falta la fila settings (id=1): ejecuta la migración inicial");
      return settingsRow.parse(data);
    },

    /* ── Votación ── */
    async findExistingVote(q) {
      const ors = [`voter_key.eq.${orValue(q.voterKey)}`, `device_fp.eq.${orValue(q.deviceFp)}`];
      if (q.cookieId) ors.push(`cookie_id.eq.${orValue(q.cookieId)}`);
      if (q.storageId) ors.push(`storage_id.eq.${orValue(q.storageId)}`);
      const { data, error } = await sb
        .from("votes")
        .select("*")
        .eq("dish_id", q.dishId)
        .neq("status", "rejected")
        .or(ors.join(","))
        .order("created_at", { ascending: true })
        .limit(20);
      if (error) fail("findExistingVote", error);
      return pickBestMatch(z.array(voteRow).parse(data), q);
    },

    async getVoteHistory({ dishId, ipHash, subnetHash, voterKey }) {
      const votes = () => sb.from("votes").select("*", { count: "exact", head: true });
      const attempts = () => sb.from("vote_attempts").select("*", { count: "exact", head: true });
      const [ipVotesDish24h, ipVotesAll10m, subnetVotesDish1h, voterAttempts10m, ipAttempts10m] = await Promise.all([
        countRows("ipVotesDish24h", votes().eq("dish_id", dishId).eq("ip_hash", ipHash).neq("status", "rejected").gte("created_at", iso(DAY))),
        countRows("ipVotesAll10m", votes().eq("ip_hash", ipHash).neq("status", "rejected").gte("created_at", iso(10 * MIN))),
        countRows("subnetVotesDish1h", votes().eq("dish_id", dishId).eq("subnet_hash", subnetHash).neq("status", "rejected").gte("created_at", iso(HOUR))),
        countRows("voterAttempts10m", attempts().eq("voter_key", voterKey).gte("created_at", iso(10 * MIN))),
        countRows("ipAttempts10m", attempts().eq("ip_hash", ipHash).gte("created_at", iso(10 * MIN))),
      ]);
      const history: VoteHistory = { ipVotesDish24h, ipVotesAll10m, subnetVotesDish1h, voterAttempts10m, ipAttempts10m };
      return history;
    },

    async insertVote(v) {
      const { data, error } = await sb.from("votes").insert({ ...v }).select("*").single();
      if (error) {
        if (error.code === "23505") throw new UniqueViolationError(uniqueField(error));
        fail("insertVote", error);
      }
      return voteRow.parse(data);
    },

    async logAttempt(a) {
      const { error } = await sb.from("vote_attempts").insert({ ...a });
      if (error) fail("logAttempt", error);
    },

    async getValidVotesCount(dishId) {
      return countRows(
        "getValidVotesCount",
        sb.from("votes").select("*", { count: "exact", head: true }).eq("dish_id", dishId).eq("status", "valid"),
      );
    },

    /* ── Admin: restaurantes ── */
    async listRestaurants() {
      const { data, error } = await sb.from("restaurants").select("*").order("name", { ascending: true });
      if (error) fail("listRestaurants", error);
      return z.array(restaurantRow).parse(data);
    },

    async getRestaurant(id) {
      const { data, error } = await sb.from("restaurants").select("*").eq("id", id).maybeSingle();
      if (error) fail("getRestaurant", error);
      return data ? restaurantRow.parse(data) : null;
    },

    async createRestaurant(input) {
      const { data, error } = await sb.from("restaurants").insert({ ...input }).select("*").single();
      if (error) {
        if (error.code === "23505") throw new Error(`Ya existe un restaurante con el slug "${input.slug}"`);
        fail("createRestaurant", error);
      }
      return restaurantRow.parse(data);
    },

    async updateRestaurant(id, input) {
      const { data, error } = await sb.from("restaurants").update({ ...input }).eq("id", id).select("*").single();
      if (error) {
        if (isNoRows(error)) throw new Error("Restaurante no encontrado");
        if (error.code === "23505") throw new Error(`Ya existe un restaurante con el slug "${input.slug ?? ""}"`);
        fail("updateRestaurant", error);
      }
      return restaurantRow.parse(data);
    },

    async deleteRestaurant(id) {
      const { error } = await sb.from("restaurants").delete().eq("id", id);
      if (error) fail("deleteRestaurant", error);
    },

    /* ── Admin: platos ── */
    async listDishes(filter) {
      let query = sb.from("dishes").select(DISH_WITH_RESTAURANT);
      if (filter?.restaurantId) query = query.eq("restaurant_id", filter.restaurantId);
      const { data, error } = await query
        .order("votes_count", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) fail("listDishes", error);
      return z.array(dishJoinRow).parse(data).map(toDishWithRestaurant);
    },

    async getDish(id) {
      const { data, error } = await sb.from("dishes").select(DISH_WITH_RESTAURANT).eq("id", id).maybeSingle();
      if (error) fail("getDish", error);
      return data ? toDishWithRestaurant(dishJoinRow.parse(data)) : null;
    },

    async createDish(input) {
      const { data, error } = await sb.from("dishes").insert({ ...input }).select("*").single();
      if (error) fail("createDish", error);
      return dishRow.parse(data);
    },

    async updateDish(id, input) {
      const { data, error } = await sb.from("dishes").update({ ...input }).eq("id", id).select("*").single();
      if (error) {
        if (isNoRows(error)) throw new Error("Plato no encontrado");
        fail("updateDish", error);
      }
      return dishRow.parse(data);
    },

    async deleteDish(id) {
      const { error } = await sb.from("dishes").delete().eq("id", id);
      if (error) fail("deleteDish", error);
    },

    /* ── Admin: votos y métricas ── */
    async listVotes(filter) {
      // Con restaurantId se hace un inner join a dishes para filtrar por dueño.
      const columns: string = filter.restaurantId ? "*, dishes!inner(restaurant_id)" : "*";
      let query = sb.from("votes").select(columns);
      if (filter.dishId) query = query.eq("dish_id", filter.dishId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.restaurantId) query = query.eq("dishes.restaurant_id", filter.restaurantId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(filter.limit ?? 200);
      if (error) fail("listVotes", error);
      return z.array(voteRow).parse(data);
    },

    async reviewVote(id, status, note) {
      // El trigger votes_recount recalcula dishes.votes_count.
      const { data, error } = await sb
        .from("votes")
        .update({ status, review_note: note })
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        if (isNoRows(error)) throw new Error("Voto no encontrado");
        fail("reviewVote", error);
      }
      return voteRow.parse(data);
    },

    async getDishStats(filter) {
      let dishIds: string[] | null = null;
      if (filter?.restaurantId) {
        const { data, error } = await sb.from("dishes").select("id").eq("restaurant_id", filter.restaurantId);
        if (error) fail("getDishStats.dishes", error);
        dishIds = z.array(z.object({ id: z.string() })).parse(data).map((d) => d.id);
        if (dishIds.length === 0) return [];
      }
      let query = sb.from("dish_stats").select("*");
      if (dishIds) query = query.in("dish_id", dishIds);
      const { data, error } = await query;
      if (error) fail("getDishStats", error);
      return z.array(statsRow).parse(data);
    },

    async listAttempts(filter) {
      let query = sb.from("vote_attempts").select("*");
      if (filter.dishId) query = query.eq("dish_id", filter.dishId);
      if (filter.outcome) query = query.eq("outcome", filter.outcome);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(filter.limit ?? 200);
      if (error) fail("listAttempts", error);
      return z.array(attemptRow).parse(data);
    },

    async updateSettings(patch) {
      const { data, error } = await sb
        .from("settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("*")
        .single();
      if (error) fail("updateSettings", error);
      return settingsRow.parse(data);
    },

    /* ── Perfiles ── */
    async getProfileByUserId(userId) {
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) fail("getProfileByUserId", error);
      return data ? profileRow.parse(data) : null;
    },

    async listProfiles() {
      const { data, error } = await sb.from("profiles").select("*").order("email", { ascending: true });
      if (error) fail("listProfiles", error);
      return z.array(profileRow).parse(data);
    },

    async upsertProfile(p) {
      const { data, error } = await sb
        .from("profiles")
        .upsert({ ...p }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) fail("upsertProfile", error);
      return profileRow.parse(data);
    },

    /* ── Archivos ── */
    async uploadImage({ bucketPath, bytes, contentType }) {
      const { error } = await sb.storage.from(BUCKET).upload(bucketPath, bytes, { upsert: true, contentType });
      if (error) fail("uploadImage", error);
      const { data } = sb.storage.from(BUCKET).getPublicUrl(bucketPath);
      return { publicUrl: data.publicUrl };
    },
  };

  return db;
}

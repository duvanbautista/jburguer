/**
 * Interfaz de la capa de datos. Hay dos implementaciones:
 *   - supabase.ts : producción (Postgres + RLS + Storage + Realtime)
 *   - memory.ts   : modo demo sin credenciales (estado en memoria del proceso)
 * `getDb()` en ./index.ts elige una según las variables de entorno.
 *
 * Reglas:
 *  - Toda escritura de votos pasa por aquí (nunca desde el navegador).
 *  - La lógica antifraude vive en src/lib/antifraud (pura, testeable); aquí solo primitivas.
 *  - Los métodos lanzan `UniqueViolationError` cuando chocan con un índice único
 *    (dish_id + voter_key / cookie_id / storage_id): el motor lo traduce a ALREADY_VOTED.
 */
import type {
  AttemptOutcome,
  Dish,
  DishStats,
  DishWithRestaurant,
  Profile,
  Restaurant,
  Settings,
  Vote,
  VoteAttempt,
  VoteStatus,
} from "@/lib/types";

export class UniqueViolationError extends Error {
  constructor(public readonly field: "voter_key" | "cookie_id" | "storage_id" | "unknown") {
    super(`unique violation on ${field}`);
    this.name = "UniqueViolationError";
  }
}

export interface ExistingVoteLookup {
  dishId: string;
  voterKey: string;
  deviceFp: string;
  cookieId: string | null;
  storageId: string | null;
}

/** Resultado de buscar votos previos del mismo votante para un plato. */
export interface ExistingVoteMatch {
  vote: Vote;
  matchedBy: Array<"voter_key" | "device_fp" | "cookie_id" | "storage_id">;
}

export interface VoteHistory {
  /** Votos (valid+suspect) de esta IP a este plato en las últimas 24h. */
  ipVotesDish24h: number;
  /** Votos (valid+suspect) de esta IP a cualquier plato en los últimos 10 min. */
  ipVotesAll10m: number;
  /** Votos de la misma subred /24 (o /64) a este plato en la última hora. */
  subnetVotesDish1h: number;
  /** Intentos (cualquier resultado) de este voter_key en los últimos 10 min. */
  voterAttempts10m: number;
  /** Intentos de esta IP en los últimos 10 min (incluye duplicados y rate-limited). */
  ipAttempts10m: number;
}

export type NewVote = Omit<Vote, "id" | "created_at" | "review_note">;
export type NewAttempt = Omit<VoteAttempt, "id" | "created_at">;

export interface DishInput {
  restaurant_id: string;
  name: string;
  inspired_by: string;
  story: string;
  ingredients: string[];
  image_url: string | null;
  is_published: boolean;
}

export interface RestaurantInput {
  slug: string;
  name: string;
  city: string;
  description: string | null;
  logo_url: string | null;
  instagram: string | null;
  owner_id: string | null;
}

export interface Db {
  readonly kind: "supabase" | "memory";

  /* ── Público ── */
  listPublishedDishes(): Promise<DishWithRestaurant[]>;
  getPublishedDish(id: string): Promise<DishWithRestaurant | null>;
  getSettings(): Promise<Settings>;

  /* ── Votación (usado solo por el motor antifraude en servidor) ── */
  findExistingVote(q: ExistingVoteLookup): Promise<ExistingVoteMatch | null>;
  getVoteHistory(q: { dishId: string; ipHash: string; subnetHash: string; voterKey: string }): Promise<VoteHistory>;
  insertVote(v: NewVote): Promise<Vote>;
  logAttempt(a: NewAttempt): Promise<void>;
  /** Conteo de votos 'valid' del plato (fuente de verdad para la UI). */
  getValidVotesCount(dishId: string): Promise<number>;

  /* ── Admin: restaurantes ── */
  listRestaurants(): Promise<Restaurant[]>;
  getRestaurant(id: string): Promise<Restaurant | null>;
  createRestaurant(input: RestaurantInput): Promise<Restaurant>;
  updateRestaurant(id: string, input: Partial<RestaurantInput>): Promise<Restaurant>;
  deleteRestaurant(id: string): Promise<void>;

  /* ── Admin: platos ── */
  listDishes(filter?: { restaurantId?: string }): Promise<DishWithRestaurant[]>;
  getDish(id: string): Promise<DishWithRestaurant | null>;
  createDish(input: DishInput): Promise<Dish>;
  updateDish(id: string, input: Partial<DishInput>): Promise<Dish>;
  deleteDish(id: string): Promise<void>;

  /* ── Admin: votos y métricas ── */
  listVotes(filter: { dishId?: string; restaurantId?: string; status?: VoteStatus; limit?: number }): Promise<Vote[]>;
  reviewVote(id: string, status: Extract<VoteStatus, "valid" | "rejected">, note: string | null): Promise<Vote>;
  getDishStats(filter?: { restaurantId?: string }): Promise<DishStats[]>;
  listAttempts(filter: { dishId?: string; outcome?: AttemptOutcome; limit?: number }): Promise<VoteAttempt[]>;
  updateSettings(patch: Partial<Omit<Settings, "id" | "updated_at">>): Promise<Settings>;

  /* ── Perfiles ── */
  getProfileByUserId(userId: string): Promise<Profile | null>;
  listProfiles(): Promise<Profile[]>;
  upsertProfile(p: Omit<Profile, "created_at">): Promise<Profile>;

  /* ── Archivos (imágenes de platos / logos) ── */
  uploadImage(params: { bucketPath: string; bytes: Uint8Array; contentType: string }): Promise<{ publicUrl: string }>;
}

/**
 * Tipos de dominio compartidos por API, UI pública, panel admin y capa de datos.
 * Cualquier cambio aquí impacta a todos los módulos: mantener estable.
 */

export type VoteStatus = "valid" | "suspect" | "rejected";
export type UserRole = "admin" | "restaurant";

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string | null;
  logo_url: string | null;
  instagram: string | null;
  owner_id: string | null;
  created_at: string;
}

export interface Dish {
  id: string;
  restaurant_id: string;
  name: string;
  /** Lugar / país / región que inspira el plato (ej. "Nicaragua", "Barrio Egipto"). */
  inspired_by: string;
  /** Historia del plato: qué representa, por qué ese lugar. Markdown simple permitido. */
  story: string;
  ingredients: string[];
  image_url: string | null;
  is_published: boolean;
  /** Conteo materializado de votos con status = 'valid'. */
  votes_count: number;
  created_at: string;
  updated_at: string;
}

/** Plato con su restaurante embebido, tal como lo consume la vista pública. */
export interface DishWithRestaurant extends Dish {
  restaurant: Pick<Restaurant, "id" | "slug" | "name" | "city" | "logo_url" | "instagram">;
}

export interface Vote {
  id: string;
  dish_id: string;
  /** hmac(device_fp | server_fp): identidad principal del votante. */
  voter_key: string;
  device_fp: string;
  client_fp: string;
  server_fp: string;
  cookie_id: string | null;
  storage_id: string | null;
  ip_hash: string;
  subnet_hash: string;
  country: string | null;
  ua: string | null;
  risk_score: number;
  reasons: string[];
  status: VoteStatus;
  /** Nota del admin al revisar (aprobar/rechazar) un voto sospechoso. */
  review_note: string | null;
  created_at: string;
}

export type AttemptOutcome =
  | "accepted"
  | "suspect"
  | "duplicate"
  | "rate_limited"
  | "bad_challenge"
  | "voting_closed"
  | "rejected";

export interface VoteAttempt {
  id: string;
  dish_id: string;
  voter_key: string;
  ip_hash: string;
  outcome: AttemptOutcome;
  reasons: string[];
  risk_score: number;
  created_at: string;
}

export interface Settings {
  id: number;
  festival_name: string;
  edition: string;
  tagline: string;
  voting_open: boolean;
  /** Votos por IP y plato en 24h a partir de los cuales se marca 'suspect'. */
  ip_soft_limit: number;
  /** Votos por IP y plato en 24h a partir de los cuales se rechaza (429). */
  ip_hard_limit: number;
  /** Si true, coincidencia de huella de dispositivo => 409 (duplicado). Si false => 'suspect'. */
  strict_device_match: boolean;
  /** Umbral de riesgo a partir del cual el voto entra en cuarentena. */
  suspect_threshold: number;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  restaurant_id: string | null;
  created_at: string;
}

/** Sesión resuelta en servidor (Supabase Auth o modo demo). */
export interface Session {
  user: { id: string; email: string };
  profile: Profile;
}

/* ───────────── Contratos de la API pública ───────────── */

/** Lo que el navegador recolecta y envía. NUNCA se confía en él sin re-hashear en servidor. */
export interface ClientFingerprint {
  /** Componentes estables (canvas, webgl, pantalla, cores, memoria, plataforma, zona horaria, fuentes, audio). */
  components: Record<string, string | number | boolean | null>;
  /** UUID persistido en localStorage + IndexedDB + Cache API (se restaura desde el que sobreviva). */
  storageId: string | null;
  /** Versión del recolector, para invalidar huellas antiguas. */
  version: number;
}

export interface ChallengeRequest {
  dishId: string;
  fp: ClientFingerprint;
}

export interface ChallengeResponse {
  /** Token firmado (HMAC) que vincula dish + voter_key + timestamp. */
  challenge: string;
  /** Segundos de validez. */
  ttl: number;
  /** El servidor ya sabe si este votante votó este plato: la UI puede mostrar el estado sin clic. */
  alreadyVoted: boolean;
  votingOpen: boolean;
}

export interface VoteRequest {
  challenge: string;
  fp: ClientFingerprint;
  /** Token de Turnstile, solo si está configurado. */
  turnstileToken?: string;
}

export type VoteErrorCode =
  | "ALREADY_VOTED"
  | "RATE_LIMITED"
  | "BAD_CHALLENGE"
  | "VOTING_CLOSED"
  | "CAPTCHA_REQUIRED"
  | "CAPTCHA_FAILED"
  | "DISH_NOT_FOUND"
  | "BAD_REQUEST";

export interface VoteSuccessResponse {
  ok: true;
  status: Extract<VoteStatus, "valid" | "suspect">;
  votes_count: number;
}

export interface VoteErrorResponse {
  ok: false;
  code: VoteErrorCode;
  message: string;
}

export type VoteResponse = VoteSuccessResponse | VoteErrorResponse;

/** Métricas agregadas para el panel admin. */
export interface DishStats {
  dish_id: string;
  valid: number;
  suspect: number;
  rejected: number;
  duplicate_attempts: number;
  rate_limited_attempts: number;
}

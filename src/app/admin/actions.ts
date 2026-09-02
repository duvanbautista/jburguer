"use server";

/**
 * Server actions del panel admin.
 * Regla de oro: la capa Db usa service role y NO valida permisos, así que
 * cada acción vuelve a comprobar la sesión y la propiedad del recurso
 * (canManageRestaurant / rol admin) ANTES de tocar la base de datos.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageRestaurant, requireSession, signOut } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { DishInput, RestaurantInput } from "@/lib/db";
import type { Session } from "@/lib/types";
import { fieldErrorsFrom, type FormState } from "@/components/admin/form-state";

/* ───────────────────────── Utilidades ───────────────────────── */

function fail(error: string, fieldErrors: Record<string, string> = {}): FormState {
  return { error, fieldErrors, success: null };
}

function invalid(error: z.ZodError): FormState {
  return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(error), success: null };
}

function ok(success: string): FormState {
  return { error: null, fieldErrors: {}, success };
}

function isAdmin(session: Session): boolean {
  return session.profile.role === "admin";
}

/** Devuelve un FormState de error si la sesión no es de administrador. */
function denyUnlessAdmin(session: Session): FormState | null {
  return isAdmin(session) ? null : fail("Solo un administrador puede hacer esto.");
}

function describeError(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "error inesperado";
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** Invalida la vista pública (ranking y fichas) y las listas del panel. */
function revalidateContent(): void {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/platos");
  revalidatePath("/admin/restaurantes");
}

/* ───────────────────────── Imágenes ───────────────────────── */

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageField =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "file"; bytes: Uint8Array; contentType: string; ext: string };

/** Lee y valida un archivo de imagen del FormData (tipo y tamaño). */
async function readImage(formData: FormData, key: string): Promise<ImageField> {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return { kind: "none" };
  const ext = IMAGE_EXT[file.type];
  if (!ext) return { kind: "error", message: "Formato no admitido. Usa JPG, PNG, WebP o AVIF." };
  if (file.size > MAX_IMAGE_BYTES) return { kind: "error", message: "La imagen supera los 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { kind: "file", bytes, contentType: file.type, ext };
}

/* ───────────────────────── Sesión ───────────────────────── */

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

/* ───────────────────────── Platos ───────────────────────── */

const ingredientsSchema = z.string().transform((raw, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    ctx.addIssue({ code: "custom", message: "La lista de ingredientes no es válida." });
    return z.NEVER;
  }
  if (!Array.isArray(parsed)) {
    ctx.addIssue({ code: "custom", message: "La lista de ingredientes no es válida." });
    return z.NEVER;
  }
  const list = Array.from(
    new Set(
      parsed
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  if (list.length === 0) {
    ctx.addIssue({ code: "custom", message: "Añade al menos un ingrediente." });
    return z.NEVER;
  }
  if (list.length > 30) {
    ctx.addIssue({ code: "custom", message: "Máximo 30 ingredientes." });
    return z.NEVER;
  }
  if (list.some((s) => s.length > 60)) {
    ctx.addIssue({ code: "custom", message: "Cada ingrediente debe tener máximo 60 caracteres." });
    return z.NEVER;
  }
  return list;
});

const dishSchema = z.object({
  restaurant_id: z.string().trim(),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80, "Máximo 80 caracteres."),
  inspired_by: z
    .string()
    .trim()
    .min(2, "Indica el lugar, región o país que inspira el plato.")
    .max(120, "Máximo 120 caracteres."),
  story: z
    .string()
    .trim()
    .min(20, "Cuenta la historia con al menos 20 caracteres.")
    .max(2000, "Máximo 2000 caracteres."),
  ingredients: ingredientsSchema,
  is_published: z.boolean(),
});

function dishInputFrom(formData: FormData) {
  return {
    restaurant_id: text(formData, "restaurant_id"),
    name: text(formData, "name"),
    inspired_by: text(formData, "inspired_by"),
    story: text(formData, "story"),
    ingredients: text(formData, "ingredients"),
    is_published: checked(formData, "is_published"),
  };
}

export async function createDish(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = dishSchema.safeParse(dishInputFrom(formData));
  if (!parsed.success) return invalid(parsed.error);

  // El restaurante solo puede crear platos en el suyo: se ignora lo que envíe el formulario.
  const restaurantId = isAdmin(session) ? parsed.data.restaurant_id : (session.profile.restaurant_id ?? "");
  if (!restaurantId) {
    return isAdmin(session)
      ? fail("Selecciona un restaurante.", { restaurant_id: "Selecciona un restaurante." })
      : fail("Tu cuenta no tiene un restaurante asignado.");
  }
  if (!canManageRestaurant(session, restaurantId)) return fail("No tienes permiso para gestionar ese restaurante.");

  const image = await readImage(formData, "image");
  if (image.kind === "error") return fail(image.message, { image: image.message });

  const db = await getDb();
  if (!(await db.getRestaurant(restaurantId))) return fail("El restaurante seleccionado no existe.");

  try {
    const dish = await db.createDish({
      restaurant_id: restaurantId,
      name: parsed.data.name,
      inspired_by: parsed.data.inspired_by,
      story: parsed.data.story,
      ingredients: parsed.data.ingredients,
      image_url: null,
      is_published: parsed.data.is_published,
    });
    if (image.kind === "file") {
      const { publicUrl } = await db.uploadImage({
        bucketPath: `dishes/${dish.id}-${Date.now()}.${image.ext}`,
        bytes: image.bytes,
        contentType: image.contentType,
      });
      await db.updateDish(dish.id, { image_url: publicUrl });
    }
  } catch (e) {
    return fail(`No se pudo guardar el plato: ${describeError(e)}`);
  }

  revalidateContent();
  redirect("/admin/platos");
}

export async function updateDish(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const db = await getDb();
  const current = await db.getDish(id);
  if (!current) return fail("El plato ya no existe.");
  if (!canManageRestaurant(session, current.restaurant_id)) return fail("No tienes permiso para editar este plato.");

  const parsed = dishSchema.safeParse(dishInputFrom(formData));
  if (!parsed.success) return invalid(parsed.error);

  // Solo el admin puede mover un plato a otro restaurante.
  const restaurantId = isAdmin(session) ? parsed.data.restaurant_id || current.restaurant_id : current.restaurant_id;
  if (!canManageRestaurant(session, restaurantId)) return fail("No tienes permiso para gestionar ese restaurante.");
  if (restaurantId !== current.restaurant_id && !(await db.getRestaurant(restaurantId))) {
    return fail("El restaurante seleccionado no existe.", { restaurant_id: "El restaurante no existe." });
  }

  const image = await readImage(formData, "image");
  if (image.kind === "error") return fail(image.message, { image: image.message });

  const patch: Partial<DishInput> = {
    restaurant_id: restaurantId,
    name: parsed.data.name,
    inspired_by: parsed.data.inspired_by,
    story: parsed.data.story,
    ingredients: parsed.data.ingredients,
    is_published: parsed.data.is_published,
  };

  try {
    if (image.kind === "file") {
      const { publicUrl } = await db.uploadImage({
        bucketPath: `dishes/${id}-${Date.now()}.${image.ext}`,
        bytes: image.bytes,
        contentType: image.contentType,
      });
      patch.image_url = publicUrl;
    } else if (checked(formData, "remove_image")) {
      patch.image_url = null;
    }
    await db.updateDish(id, patch);
  } catch (e) {
    return fail(`No se pudo guardar el plato: ${describeError(e)}`);
  }

  revalidateContent();
  revalidatePath(`/admin/platos/${id}`);
  redirect("/admin/platos");
}

export async function deleteDish(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const db = await getDb();
  const dish = await db.getDish(id);
  if (!dish) return fail("El plato ya no existe.");
  if (!canManageRestaurant(session, dish.restaurant_id)) return fail("No tienes permiso para eliminar este plato.");

  // Confirmación explícita: el usuario debe escribir el nombre del plato.
  const confirm = text(formData, "confirm").trim();
  if (confirm.toLowerCase() !== dish.name.trim().toLowerCase()) {
    return fail("Escribe el nombre exacto del plato para confirmar.", { confirm: "El nombre no coincide." });
  }

  try {
    await db.deleteDish(id);
  } catch (e) {
    return fail(`No se pudo eliminar el plato: ${describeError(e)}`);
  }

  revalidateContent();
  redirect("/admin/platos");
}

/* ───────────────────────── Restaurantes (solo admin) ───────────────────────── */

/** Normaliza un usuario de Instagram: admite @usuario o la URL completa. */
function normalizeInstagram(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();
  return s || null;
}

const restaurantSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Mínimo 2 caracteres.")
    .max(60, "Máximo 60 caracteres.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (ej. la-fragua)."),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80, "Máximo 80 caracteres."),
  city: z.string().trim().min(2, "Indica la ciudad.").max(60, "Máximo 60 caracteres."),
  description: z
    .string()
    .trim()
    .max(300, "Máximo 300 caracteres.")
    .transform((s) => s || null),
  instagram: z.string().trim().max(120, "Máximo 120 caracteres.").transform(normalizeInstagram),
});

function restaurantInputFrom(formData: FormData) {
  return {
    slug: text(formData, "slug"),
    name: text(formData, "name"),
    city: text(formData, "city"),
    description: text(formData, "description"),
    instagram: text(formData, "instagram"),
  };
}

export async function createRestaurant(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const parsed = restaurantSchema.safeParse(restaurantInputFrom(formData));
  if (!parsed.success) return invalid(parsed.error);

  const logo = await readImage(formData, "logo");
  if (logo.kind === "error") return fail(logo.message, { logo: logo.message });

  const db = await getDb();
  const existing = await db.listRestaurants();
  if (existing.some((r) => r.slug === parsed.data.slug)) {
    return fail("Ese slug ya está en uso.", { slug: "Ya existe un restaurante con ese slug." });
  }

  try {
    const restaurant = await db.createRestaurant({ ...parsed.data, logo_url: null, owner_id: null });
    if (logo.kind === "file") {
      const { publicUrl } = await db.uploadImage({
        bucketPath: `logos/${restaurant.id}-${Date.now()}.${logo.ext}`,
        bytes: logo.bytes,
        contentType: logo.contentType,
      });
      await db.updateRestaurant(restaurant.id, { logo_url: publicUrl });
    }
  } catch (e) {
    return fail(`No se pudo crear el restaurante: ${describeError(e)}`);
  }

  revalidateContent();
  redirect("/admin/restaurantes");
}

export async function updateRestaurant(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const db = await getDb();
  const current = await db.getRestaurant(id);
  if (!current) return fail("El restaurante ya no existe.");

  const parsed = restaurantSchema.safeParse(restaurantInputFrom(formData));
  if (!parsed.success) return invalid(parsed.error);

  const logo = await readImage(formData, "logo");
  if (logo.kind === "error") return fail(logo.message, { logo: logo.message });

  const existing = await db.listRestaurants();
  if (existing.some((r) => r.slug === parsed.data.slug && r.id !== id)) {
    return fail("Ese slug ya está en uso.", { slug: "Ya existe otro restaurante con ese slug." });
  }

  const patch: Partial<RestaurantInput> = { ...parsed.data };
  try {
    if (logo.kind === "file") {
      const { publicUrl } = await db.uploadImage({
        bucketPath: `logos/${id}-${Date.now()}.${logo.ext}`,
        bytes: logo.bytes,
        contentType: logo.contentType,
      });
      patch.logo_url = publicUrl;
    } else if (checked(formData, "remove_logo")) {
      patch.logo_url = null;
    }
    await db.updateRestaurant(id, patch);
  } catch (e) {
    return fail(`No se pudo guardar el restaurante: ${describeError(e)}`);
  }

  revalidateContent();
  revalidatePath(`/admin/restaurantes/${id}`);
  redirect("/admin/restaurantes");
}

export async function deleteRestaurant(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const db = await getDb();
  const restaurant = await db.getRestaurant(id);
  if (!restaurant) return fail("El restaurante ya no existe.");

  const confirm = text(formData, "confirm").trim();
  if (confirm.toLowerCase() !== restaurant.name.trim().toLowerCase()) {
    return fail("Escribe el nombre exacto del restaurante para confirmar.", { confirm: "El nombre no coincide." });
  }

  try {
    await db.deleteRestaurant(id);
  } catch (e) {
    return fail(`No se pudo eliminar el restaurante: ${describeError(e)}`);
  }

  revalidateContent();
  redirect("/admin/restaurantes");
}

/* ───────────────────────── Cuentas (solo admin) ───────────────────────── */

const profileSchema = z.object({
  id: z.string().trim().min(1, "Cuenta no válida."),
  role: z.enum(["admin", "restaurant"], { error: "Rol no válido." }),
  restaurant_id: z
    .string()
    .trim()
    .transform((s) => s || null),
});

export async function assignProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const parsed = profileSchema.safeParse({
    id: text(formData, "id"),
    role: text(formData, "role"),
    restaurant_id: text(formData, "restaurant_id"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const db = await getDb();
  const profiles = await db.listProfiles();
  const target = profiles.find((p) => p.id === parsed.data.id);
  if (!target) return fail("La cuenta no existe.");
  if (target.id === session.user.id && parsed.data.role !== "admin") {
    return fail("No puedes quitarte tu propio rol de administrador.");
  }

  const restaurant = parsed.data.restaurant_id ? await db.getRestaurant(parsed.data.restaurant_id) : null;
  if (parsed.data.restaurant_id && !restaurant) return fail("El restaurante seleccionado no existe.");

  try {
    await db.upsertProfile({
      id: target.id,
      email: target.email,
      role: parsed.data.role,
      restaurant_id: restaurant ? restaurant.id : null,
    });
    // Si el restaurante aún no tiene dueño registrado, esta cuenta pasa a serlo.
    if (restaurant && !restaurant.owner_id) {
      await db.updateRestaurant(restaurant.id, { owner_id: target.id });
    }
  } catch (e) {
    return fail(`No se pudo actualizar la cuenta: ${describeError(e)}`);
  }

  revalidatePath("/admin/restaurantes");
  return ok("Cuenta actualizada.");
}

/* ───────────────────────── Revisión de votos (solo admin) ───────────────────────── */

const reviewSchema = z.object({
  vote_id: z.string().trim().min(1, "Voto no válido."),
  decision: z.enum(["valid", "rejected"], { error: "Decisión no válida." }),
  note: z
    .string()
    .trim()
    .max(300, "La nota debe tener máximo 300 caracteres.")
    .transform((s) => s || null),
});

export async function reviewVote(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const parsed = reviewSchema.safeParse({
    vote_id: text(formData, "vote_id"),
    decision: text(formData, "decision"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const db = await getDb();
  try {
    await db.reviewVote(parsed.data.vote_id, parsed.data.decision, parsed.data.note);
  } catch (e) {
    return fail(`No se pudo revisar el voto: ${describeError(e)}`);
  }

  // Aprobar un voto cambia el conteo público: se invalida el ranking.
  revalidateContent();
  revalidatePath("/admin/votos");
  return ok(parsed.data.decision === "valid" ? "Voto aprobado: ya cuenta en el ranking." : "Voto rechazado.");
}

/* ───────────────────────── Ajustes (solo admin) ───────────────────────── */

const intField = (min: number, max: number) =>
  z.coerce
    .number({ error: "Debe ser un número." })
    .int("Debe ser un número entero.")
    .min(min, `Mínimo ${min}.`)
    .max(max, `Máximo ${max}.`);

const settingsSchema = z
  .object({
    festival_name: z.string().trim().min(2, "Escribe el nombre del festival.").max(80, "Máximo 80 caracteres."),
    edition: z.string().trim().min(2, "Escribe la edición.").max(120, "Máximo 120 caracteres."),
    tagline: z.string().trim().min(2, "Escribe el lema.").max(300, "Máximo 300 caracteres."),
    voting_open: z.boolean(),
    ip_soft_limit: intField(1, 1000),
    ip_hard_limit: intField(1, 1000),
    strict_device_match: z.boolean(),
    suspect_threshold: intField(1, 500),
  })
  .refine((d) => d.ip_hard_limit >= d.ip_soft_limit, {
    path: ["ip_hard_limit"],
    message: "El límite duro debe ser mayor o igual que el límite suave.",
  });

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const denied = denyUnlessAdmin(session);
  if (denied) return denied;

  const parsed = settingsSchema.safeParse({
    festival_name: text(formData, "festival_name"),
    edition: text(formData, "edition"),
    tagline: text(formData, "tagline"),
    voting_open: checked(formData, "voting_open"),
    ip_soft_limit: text(formData, "ip_soft_limit"),
    ip_hard_limit: text(formData, "ip_hard_limit"),
    strict_device_match: checked(formData, "strict_device_match"),
    suspect_threshold: text(formData, "suspect_threshold"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const db = await getDb();
  try {
    await db.updateSettings(parsed.data);
  } catch (e) {
    return fail(`No se pudieron guardar los ajustes: ${describeError(e)}`);
  }

  revalidateContent();
  revalidatePath("/admin/ajustes");
  return ok("Ajustes guardados.");
}

/**
 * Carga los datos demo del festival en Supabase.
 *
 *   npx tsx scripts/seed.ts            (o: npm run seed)
 *   npx tsx scripts/seed.ts --reset-passwords   (restablece DEMO_PASSWORD en cuentas existentes)
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY,
 * y la migración supabase/migrations/20260901000000_init.sql aplicada.
 * Es idempotente: se puede ejecutar tantas veces como se quiera.
 *
 * Nota: no importa src/lib/supabase/admin.ts porque ese módulo lleva
 * `server-only` (falla fuera de Next); crea su propio cliente service role.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { generateDemoVotes } from "../src/lib/db/demo-votes";
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, SEED_DISHES, SEED_RESTAURANTS, SEED_SETTINGS } from "../src/lib/seed-data";

const ROOT = process.cwd();
loadEnv({ path: [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")], quiet: true });

const BUCKET = "dish-images";
const CHUNK = 200;

const log = (msg: string) => console.log(`  ${msg}`);
const step = (msg: string) => console.log(`\n== ${msg}`);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\nERROR: falta la variable ${name}.`);
    console.error("Copia .env.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n");
    process.exit(1);
  }
  return value;
}

function assertOk(ctx: string, error: { message: string } | null): void {
  if (error) throw new Error(`${ctx}: ${error.message}`);
}

/* ───────────── Usuarios ───────────── */

async function listAllUsers(sb: SupabaseClient): Promise<Map<string, User>> {
  const byEmail = new Map<string, User>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    assertOk("listUsers", error);
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
    if (data.users.length < perPage) break;
  }
  return byEmail;
}

async function ensureUser(
  sb: SupabaseClient,
  existing: Map<string, User>,
  email: string,
  role: "admin" | "restaurant",
  resetPassword: boolean,
): Promise<User> {
  const key = email.toLowerCase();
  const found = existing.get(key);
  if (found) {
    const { data, error } = await sb.auth.admin.updateUserById(found.id, {
      app_metadata: { ...found.app_metadata, role },
      ...(resetPassword ? { password: DEMO_PASSWORD } : {}),
    });
    assertOk(`updateUserById(${email})`, error);
    if (!data.user) throw new Error(`updateUserById(${email}): respuesta sin usuario`);
    log(`reutilizado  ${email}  (${role})${resetPassword ? "  contraseña restablecida" : ""}`);
    return data.user;
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: key,
    password: DEMO_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
  });
  assertOk(`createUser(${email})`, error);
  if (!data.user) throw new Error(`createUser(${email}): respuesta sin usuario`);
  log(`creado       ${email}  (${role})`);
  existing.set(key, data.user);
  return data.user;
}

/* ───────────── Principal ───────────── */

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const resetPasswords = process.argv.includes("--reset-passwords");

  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`Burger Liga · seed → ${url}`);

  // (a) Usuarios de Auth
  step("Usuarios (auth.users)");
  const existing = await listAllUsers(sb);
  const admin = await ensureUser(sb, existing, DEMO_ADMIN_EMAIL, "admin", resetPasswords);
  const owners = new Map<string, User>();
  for (const r of SEED_RESTAURANTS) owners.set(r.id, await ensureUser(sb, existing, r.email, "restaurant", resetPasswords));

  // (b) Restaurantes
  step("Restaurantes");
  {
    const rows = SEED_RESTAURANTS.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      description: r.description,
      instagram: r.instagram,
      owner_id: owners.get(r.id)?.id ?? null,
    }));
    const { error } = await sb.from("restaurants").upsert(rows, { onConflict: "id" });
    assertOk("upsert restaurants", error);
    log(`${rows.length} restaurantes sincronizados`);
  }

  // (c) Perfiles
  step("Perfiles");
  {
    const rows = [
      { id: admin.id, email: DEMO_ADMIN_EMAIL, role: "admin", restaurant_id: null },
      ...SEED_RESTAURANTS.map((r) => ({
        id: owners.get(r.id)?.id ?? "",
        email: r.email,
        role: "restaurant",
        restaurant_id: r.id,
      })),
    ];
    const { error } = await sb.from("profiles").upsert(rows, { onConflict: "id" });
    assertOk("upsert profiles", error);
    log(`${rows.length} perfiles sincronizados`);
  }

  // (d) Imágenes + platos
  step("Imágenes y platos");
  for (const d of SEED_DISHES) {
    const file = path.join(ROOT, "public", ...d.image.replace(/^\//, "").split("/"));
    const bytes = await readFile(file);
    const bucketPath = `dishes/${d.id}.jpg`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(bucketPath, bytes, { upsert: true, contentType: "image/jpeg" });
    assertOk(`upload ${bucketPath}`, upErr);
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(bucketPath);

    const { error } = await sb.from("dishes").upsert(
      {
        id: d.id,
        restaurant_id: d.restaurant_id,
        name: d.name,
        inspired_by: d.inspired_by,
        story: d.story,
        ingredients: d.ingredients,
        image_url: pub.publicUrl,
        is_published: d.is_published,
      },
      { onConflict: "id" },
    );
    assertOk(`upsert dish ${d.name}`, error);
    log(`${d.name.padEnd(24)} imagen subida y plato sincronizado`);
  }

  // (e) Ajustes
  step("Ajustes (settings id=1)");
  {
    const { error } = await sb.from("settings").upsert({ id: 1, ...SEED_SETTINGS }, { onConflict: "id" });
    assertOk("upsert settings", error);
    log(`${SEED_SETTINGS.festival_name} · ${SEED_SETTINGS.edition} · votación ${SEED_SETTINGS.voting_open ? "abierta" : "cerrada"}`);
  }

  // (f) Votos demo (solo para platos sin votos)
  step("Votos demo");
  let inserted = 0;
  for (const d of SEED_DISHES) {
    const { count, error } = await sb.from("votes").select("*", { count: "exact", head: true }).eq("dish_id", d.id);
    assertOk(`count votes ${d.name}`, error);
    if ((count ?? 0) > 0) {
      log(`${d.name.padEnd(24)} ya tiene ${count} votos, se omite`);
      continue;
    }
    const { votes, attempts } = generateDemoVotes(d.id, d.demo_votes);
    for (let i = 0; i < votes.length; i += CHUNK) {
      const { error: vErr } = await sb.from("votes").insert(votes.slice(i, i + CHUNK));
      assertOk(`insert votes ${d.name}`, vErr);
    }
    for (let i = 0; i < attempts.length; i += CHUNK) {
      const { error: aErr } = await sb.from("vote_attempts").insert(attempts.slice(i, i + CHUNK));
      assertOk(`insert attempts ${d.name}`, aErr);
    }
    inserted += votes.length;
    log(`${d.name.padEnd(24)} ${votes.length} votos válidos + intentos insertados`);
  }
  log(inserted > 0 ? `${inserted} votos demo en total` : "no hacía falta insertar votos");

  console.log("\nListo. Credenciales demo:");
  console.log(`  admin:        ${DEMO_ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  restaurantes: <slug>@burgerliga.demo / ${DEMO_PASSWORD}  (p. ej. ${SEED_RESTAURANTS[0].email})`);
  if (!resetPasswords) console.log("  (usa --reset-passwords si cambiaste alguna contraseña y quieres volver a la demo)\n");
}

main().catch((err: unknown) => {
  console.error("\nERROR durante el seed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

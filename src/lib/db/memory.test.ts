import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEED_DISHES, SEED_RESTAURANTS } from "@/lib/seed-data";
import { createMemoryDb } from "./memory";
import { UniqueViolationError, type Db, type NewVote } from "./types";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function makeVote(dishId: string, over: Partial<NewVote> = {}): NewVote {
  const k = randomUUID();
  return {
    dish_id: dishId,
    voter_key: `vk-${k}`,
    device_fp: `dfp-${k}`,
    client_fp: `cfp-${k}`,
    server_fp: `sfp-${k}`,
    cookie_id: null,
    storage_id: null,
    ip_hash: `ip-${k}`,
    subnet_hash: `sn-${k}`,
    country: "CO",
    ua: null,
    risk_score: 0,
    reasons: [],
    status: "valid",
    ...over,
  };
}

/** Base de datos vacía con un restaurante y dos platos. */
async function fixture(): Promise<{ db: Db; dishId: string; otherDishId: string; restaurantId: string }> {
  const db = createMemoryDb({ isolated: true, seed: false });
  const r = await db.createRestaurant({
    slug: "prueba",
    name: "Prueba",
    city: "Zipaquirá",
    description: null,
    logo_url: null,
    instagram: null,
    owner_id: null,
  });
  const base = { restaurant_id: r.id, inspired_by: "", story: "", ingredients: [], image_url: null, is_published: true };
  const d1 = await db.createDish({ ...base, name: "Uno" });
  const d2 = await db.createDish({ ...base, name: "Dos" });
  return { db, dishId: d1.id, otherDishId: d2.id, restaurantId: r.id };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("siembra demo", () => {
  it("carga restaurantes, platos publicados ordenados y votos válidos", async () => {
    const db = createMemoryDb({ isolated: true });
    const dishes = await db.listPublishedDishes();
    expect(dishes).toHaveLength(SEED_DISHES.length);
    expect((await db.listRestaurants())).toHaveLength(SEED_RESTAURANTS.length);
    for (const d of dishes) {
      const seed = SEED_DISHES.find((s) => s.id === d.id);
      expect(seed).toBeDefined();
      expect(d.votes_count).toBe(seed?.demo_votes);
      expect(await db.getValidVotesCount(d.id)).toBe(seed?.demo_votes);
      expect(d.restaurant.id).toBe(seed?.restaurant_id);
    }
    for (let i = 1; i < dishes.length; i++) {
      expect(dishes[i - 1].votes_count).toBeGreaterThanOrEqual(dishes[i].votes_count);
    }
  });

  it("crea perfiles demo (admin + uno por restaurante)", async () => {
    const db = createMemoryDb({ isolated: true });
    const profiles = await db.listProfiles();
    expect(profiles.filter((p) => p.role === "admin")).toHaveLength(1);
    expect(profiles.filter((p) => p.role === "restaurant")).toHaveLength(SEED_RESTAURANTS.length);
  });
});

describe("insertVote: índices únicos parciales", () => {
  it("segundo voto con el mismo voter_key lanza UniqueViolationError('voter_key')", async () => {
    const { db, dishId } = await fixture();
    await db.insertVote(makeVote(dishId, { voter_key: "vk-A" }));
    const err = await db.insertVote(makeVote(dishId, { voter_key: "vk-A" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UniqueViolationError);
    expect((err as UniqueViolationError).field).toBe("voter_key");
  });

  it("detecta duplicados por cookie_id y storage_id", async () => {
    const { db, dishId } = await fixture();
    await db.insertVote(makeVote(dishId, { cookie_id: "ck-1", storage_id: "st-1" }));
    await expect(db.insertVote(makeVote(dishId, { cookie_id: "ck-1" }))).rejects.toMatchObject({ field: "cookie_id" });
    await expect(db.insertVote(makeVote(dishId, { storage_id: "st-1" }))).rejects.toMatchObject({ field: "storage_id" });
  });

  it("el mismo votante puede votar otro plato", async () => {
    const { db, dishId, otherDishId } = await fixture();
    await db.insertVote(makeVote(dishId, { voter_key: "vk-B", cookie_id: "ck-B" }));
    await expect(db.insertVote(makeVote(otherDishId, { voter_key: "vk-B", cookie_id: "ck-B" }))).resolves.toMatchObject({ dish_id: otherDishId });
  });

  it("un voto rechazado no bloquea un nuevo voto", async () => {
    const { db, dishId } = await fixture();
    const v = await db.insertVote(makeVote(dishId, { voter_key: "vk-C", cookie_id: "ck-C" }));
    await db.reviewVote(v.id, "rejected", "fraude");
    await expect(db.insertVote(makeVote(dishId, { voter_key: "vk-C", cookie_id: "ck-C" }))).resolves.toMatchObject({ voter_key: "vk-C" });
  });
});

describe("findExistingVote", () => {
  it("devuelve matchedBy con las señales coincidentes", async () => {
    const { db, dishId } = await fixture();
    await db.insertVote(makeVote(dishId, { voter_key: "vk-D", device_fp: "dfp-D", cookie_id: "ck-D", storage_id: "st-D" }));

    const byCookie = await db.findExistingVote({ dishId, voterKey: "x", deviceFp: "x", cookieId: "ck-D", storageId: null });
    expect(byCookie?.matchedBy).toEqual(["cookie_id"]);

    const byKeyAndDevice = await db.findExistingVote({ dishId, voterKey: "vk-D", deviceFp: "dfp-D", cookieId: null, storageId: null });
    expect(byKeyAndDevice?.matchedBy).toEqual(["voter_key", "device_fp"]);

    const none = await db.findExistingVote({ dishId, voterKey: "x", deviceFp: "x", cookieId: null, storageId: "otro" });
    expect(none).toBeNull();
  });

  it("ignora votos rechazados", async () => {
    const { db, dishId } = await fixture();
    const v = await db.insertVote(makeVote(dishId, { voter_key: "vk-E" }));
    await db.reviewVote(v.id, "rejected", null);
    expect(await db.findExistingVote({ dishId, voterKey: "vk-E", deviceFp: "x", cookieId: null, storageId: null })).toBeNull();
  });
});

describe("getVoteHistory", () => {
  it("cuenta votos e intentos por ventana de tiempo", async () => {
    const { db, dishId, otherDishId } = await fixture();
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    vi.useFakeTimers();

    const at = (msAgo: number) => vi.setSystemTime(new Date(now - msAgo));
    const ip = "ip-shared";
    const subnet = "sn-shared";

    at(30 * HOUR); // fuera de 24h
    await db.insertVote(makeVote(dishId, { ip_hash: ip, subnet_hash: subnet }));
    at(5 * HOUR); // dentro de 24h, fuera de 1h y 10m
    await db.insertVote(makeVote(dishId, { ip_hash: ip, subnet_hash: subnet }));
    at(30 * MIN); // dentro de 24h y 1h, fuera de 10m
    await db.insertVote(makeVote(dishId, { ip_hash: ip, subnet_hash: subnet }));
    at(2 * MIN); // dentro de todo
    await db.insertVote(makeVote(dishId, { ip_hash: ip, subnet_hash: subnet, status: "suspect" }));
    at(3 * MIN); // otro plato, misma IP: solo cuenta en ipVotesAll10m
    await db.insertVote(makeVote(otherDishId, { ip_hash: ip, subnet_hash: subnet }));
    at(1 * MIN); // rechazado: no cuenta
    const rejected = await db.insertVote(makeVote(dishId, { ip_hash: ip, subnet_hash: subnet }));
    await db.reviewVote(rejected.id, "rejected", null);

    at(15 * MIN);
    await db.logAttempt({ dish_id: dishId, voter_key: "vk-H", ip_hash: ip, outcome: "duplicate", reasons: [], risk_score: 0 });
    at(4 * MIN);
    await db.logAttempt({ dish_id: dishId, voter_key: "vk-H", ip_hash: ip, outcome: "duplicate", reasons: [], risk_score: 0 });
    at(1 * MIN);
    await db.logAttempt({ dish_id: dishId, voter_key: "vk-otro", ip_hash: ip, outcome: "rate_limited", reasons: [], risk_score: 0 });

    at(0);
    const h = await db.getVoteHistory({ dishId, ipHash: ip, subnetHash: subnet, voterKey: "vk-H" });
    expect(h).toEqual({
      ipVotesDish24h: 3,
      ipVotesAll10m: 2,
      subnetVotesDish1h: 2,
      voterAttempts10m: 1,
      ipAttempts10m: 2,
    });

    const empty = await db.getVoteHistory({ dishId, ipHash: "ip-nadie", subnetHash: "sn-nadie", voterKey: "vk-nadie" });
    expect(empty).toEqual({ ipVotesDish24h: 0, ipVotesAll10m: 0, subnetVotesDish1h: 0, voterAttempts10m: 0, ipAttempts10m: 0 });
  });
});

describe("conteos y revisión", () => {
  it("getValidVotesCount solo cuenta votos 'valid'", async () => {
    const { db, dishId } = await fixture();
    await db.insertVote(makeVote(dishId));
    await db.insertVote(makeVote(dishId, { status: "suspect", risk_score: 70 }));
    expect(await db.getValidVotesCount(dishId)).toBe(1);
    expect((await db.getDish(dishId))?.votes_count).toBe(1);
  });

  it("reviewVote cambia el estado y recalcula votes_count", async () => {
    const { db, dishId } = await fixture();
    const valid = await db.insertVote(makeVote(dishId));
    const suspect = await db.insertVote(makeVote(dishId, { status: "suspect", risk_score: 70 }));

    const approved = await db.reviewVote(suspect.id, "valid", "Revisado: parece legítimo");
    expect(approved.status).toBe("valid");
    expect(approved.review_note).toBe("Revisado: parece legítimo");
    expect(await db.getValidVotesCount(dishId)).toBe(2);
    expect((await db.getDish(dishId))?.votes_count).toBe(2);

    const rejected = await db.reviewVote(valid.id, "rejected", null);
    expect(rejected.status).toBe("rejected");
    expect(await db.getValidVotesCount(dishId)).toBe(1);
    expect((await db.getDish(dishId))?.votes_count).toBe(1);

    await expect(db.reviewVote("no-existe", "valid", null)).rejects.toThrow();
  });

  it("getDishStats agrega votos e intentos por plato", async () => {
    const { db, dishId, restaurantId } = await fixture();
    await db.insertVote(makeVote(dishId));
    await db.insertVote(makeVote(dishId, { status: "suspect" }));
    const v = await db.insertVote(makeVote(dishId));
    await db.reviewVote(v.id, "rejected", null);
    await db.logAttempt({ dish_id: dishId, voter_key: "a", ip_hash: "b", outcome: "duplicate", reasons: ["cookie"], risk_score: 0 });
    await db.logAttempt({ dish_id: dishId, voter_key: "a", ip_hash: "b", outcome: "rate_limited", reasons: [], risk_score: 0 });
    await db.logAttempt({ dish_id: dishId, voter_key: "a", ip_hash: "b", outcome: "accepted", reasons: [], risk_score: 0 });

    const stats = (await db.getDishStats({ restaurantId })).find((s) => s.dish_id === dishId);
    expect(stats).toEqual({ dish_id: dishId, valid: 1, suspect: 1, rejected: 1, duplicate_attempts: 1, rate_limited_attempts: 1 });
    expect(await db.getDishStats({ restaurantId: "otro" })).toEqual([]);
  });

  it("listVotes filtra por plato, restaurante y estado", async () => {
    const { db, dishId, otherDishId, restaurantId } = await fixture();
    await db.insertVote(makeVote(dishId));
    await db.insertVote(makeVote(dishId, { status: "suspect" }));
    await db.insertVote(makeVote(otherDishId));
    expect(await db.listVotes({ dishId })).toHaveLength(2);
    expect(await db.listVotes({ restaurantId })).toHaveLength(3);
    expect(await db.listVotes({ status: "suspect" })).toHaveLength(1);
    expect(await db.listVotes({ restaurantId, limit: 1 })).toHaveLength(1);
  });

  it("deleteDish elimina en cascada votos e intentos", async () => {
    const { db, dishId } = await fixture();
    await db.insertVote(makeVote(dishId));
    await db.logAttempt({ dish_id: dishId, voter_key: "a", ip_hash: "b", outcome: "accepted", reasons: [], risk_score: 0 });
    await db.deleteDish(dishId);
    expect(await db.getDish(dishId)).toBeNull();
    expect(await db.listVotes({ dishId })).toEqual([]);
    expect(await db.listAttempts({ dishId })).toEqual([]);
  });
});

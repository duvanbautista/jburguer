/**
 * Generador de votos sintéticos para el demo. Lo comparten memory.ts y
 * scripts/seed.ts para que ambos modos arranquen con el mismo formato de datos.
 * Todas las señales son aleatorias (nunca corresponden a personas reales).
 */
import { randomUUID } from "node:crypto";
import type { Vote, VoteAttempt } from "@/lib/types";

export type DemoVote = Omit<Vote, "id">;
export type DemoAttempt = Omit<VoteAttempt, "id">;

const HOURS_48 = 48 * 60 * 60 * 1000;

const DEMO_UAS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 15; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
];

/**
 * Crea `count` votos 'valid' para un plato, con created_at repartidos en las
 * últimas 48 h (ordenados ascendentemente) y un intento 'accepted' por voto.
 */
export function generateDemoVotes(
  dishId: string,
  count: number,
  now: number = Date.now(),
): { votes: DemoVote[]; attempts: DemoAttempt[] } {
  const votes: DemoVote[] = [];
  const attempts: DemoAttempt[] = [];
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(now - Math.floor(Math.random() * HOURS_48));
  times.sort((a, b) => a - b);

  for (const t of times) {
    const created_at = new Date(t).toISOString();
    const voter_key = randomUUID();
    const ip_hash = randomUUID();
    votes.push({
      dish_id: dishId,
      voter_key,
      device_fp: randomUUID(),
      client_fp: randomUUID(),
      server_fp: randomUUID(),
      cookie_id: randomUUID(),
      storage_id: randomUUID(),
      ip_hash,
      subnet_hash: randomUUID(),
      country: "CO",
      ua: DEMO_UAS[Math.floor(Math.random() * DEMO_UAS.length)],
      risk_score: 0,
      reasons: [],
      status: "valid",
      review_note: null,
      created_at,
    });
    attempts.push({
      dish_id: dishId,
      voter_key,
      ip_hash,
      outcome: "accepted",
      reasons: [],
      risk_score: 0,
      created_at,
    });
  }
  return { votes, attempts };
}

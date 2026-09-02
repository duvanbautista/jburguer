import { beforeAll, describe, expect, it } from "vitest";
import { CHALLENGE_MIN_AGE_MS, CHALLENGE_TTL_MS, issueChallenge, verifyChallenge } from "./challenge";

const dishId = "10000000-0000-4000-8000-000000000001";
const voterKey = "a".repeat(64);
const T0 = 1_760_000_000_000;

beforeAll(() => {
  process.env.VOTE_SECRET = "secreto-de-pruebas";
});

describe("challenge", () => {
  it("emite y verifica un token válido", () => {
    const token = issueChallenge({ dishId, voterKey, now: T0 });
    expect(token.split(".")).toHaveLength(2);
    const res = verifyChallenge(token, { dishId, voterKey, now: T0 + 5000 });
    expect(res).toEqual({ ok: true, issuedAt: T0, ageMs: 5000 });
  });

  it("rechaza respuestas demasiado rápidas (< 1500 ms)", () => {
    const token = issueChallenge({ dishId, voterKey, now: T0 });
    const res = verifyChallenge(token, { dishId, voterKey, now: T0 + CHALLENGE_MIN_AGE_MS - 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("too_fast");
    expect(verifyChallenge(token, { dishId, voterKey, now: T0 + CHALLENGE_MIN_AGE_MS }).ok).toBe(true);
  });

  it("rechaza tokens expirados (> 10 min)", () => {
    const token = issueChallenge({ dishId, voterKey, now: T0 });
    const res = verifyChallenge(token, { dishId, voterKey, now: T0 + CHALLENGE_TTL_MS + 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("expired");
  });

  it("rechaza otro plato y otro votante", () => {
    const token = issueChallenge({ dishId, voterKey, now: T0 });
    const otherDish = verifyChallenge(token, { dishId: "10000000-0000-4000-8000-000000000002", voterKey, now: T0 + 5000 });
    expect(otherDish.ok === false && otherDish.reason).toBe("dish_mismatch");
    const otherVoter = verifyChallenge(token, { dishId, voterKey: "b".repeat(64), now: T0 + 5000 });
    expect(otherVoter.ok === false && otherVoter.reason).toBe("voter_mismatch");
  });

  it("rechaza firmas manipuladas y tokens malformados", () => {
    const token = issueChallenge({ dishId, voterKey, now: T0 });
    const [payload, sig] = token.split(".");
    const flipped = sig.endsWith("0") ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`;
    const bad = verifyChallenge(`${payload}.${flipped}`, { dishId, voterKey, now: T0 + 5000 });
    expect(bad.ok === false && bad.reason).toBe("bad_signature");

    // Payload alterado con firma original
    const tampered = Buffer.from(JSON.stringify({ d: dishId, v: voterKey, t: T0 - 100000, n: "x" })).toString("base64url");
    const tamperedRes = verifyChallenge(`${tampered}.${sig}`, { dishId, voterKey, now: T0 + 5000 });
    expect(tamperedRes.ok === false && tamperedRes.reason).toBe("bad_signature");

    for (const malformed of ["", "abc", "a.b.c", ".", "a."]) {
      const res = verifyChallenge(malformed, { dishId, voterKey, now: T0 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(["malformed", "bad_signature"]).toContain(res.reason);
    }
  });

  it("dos retos para el mismo votante y plato son distintos (nonce)", () => {
    const a = issueChallenge({ dishId, voterKey, now: T0 });
    const b = issueChallenge({ dishId, voterKey, now: T0 });
    expect(a).not.toBe(b);
  });
});

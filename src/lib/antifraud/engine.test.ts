import { describe, expect, it } from "vitest";
import type { ExistingVoteMatch, VoteHistory } from "@/lib/db/types";
import type { Settings, Vote } from "@/lib/types";
import { decide, LIMITS, RISK, type EngineInput } from "./engine";
import type { Signals } from "./signals";

/* ───────────── Fixtures ───────────── */

const settings: Settings = {
  id: 1,
  festival_name: "Burger Liga",
  edition: "Test",
  tagline: "",
  voting_open: true,
  ip_soft_limit: 3,
  ip_hard_limit: 8,
  strict_device_match: true,
  suspect_threshold: 60,
  updated_at: "2026-01-01T00:00:00Z",
};

const signals: Signals = {
  voterKey: "vk",
  deviceFp: "dfp",
  clientFp: "cfp",
  serverFp: "sfp",
  ipHash: "iph",
  subnetHash: "snh",
  country: "CO",
  ua: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0",
  cookieId: "cookie-1",
  storageId: "storage-1",
  fpQuality: { hasCanvas: true, hasWebgl: true, versionOk: true },
  botUa: false,
};

const history: VoteHistory = {
  ipVotesDish24h: 0,
  ipVotesAll10m: 0,
  subnetVotesDish1h: 0,
  voterAttempts10m: 0,
  ipAttempts10m: 0,
};

const vote: Vote = {
  id: "v1",
  dish_id: "d1",
  voter_key: "vk",
  device_fp: "dfp",
  client_fp: "cfp",
  server_fp: "sfp",
  cookie_id: "cookie-1",
  storage_id: "storage-1",
  ip_hash: "iph",
  subnet_hash: "snh",
  country: "CO",
  ua: null,
  risk_score: 0,
  reasons: [],
  status: "valid",
  review_note: null,
  created_at: "2026-01-01T00:00:00Z",
};

function match(...matchedBy: ExistingVoteMatch["matchedBy"]): ExistingVoteMatch {
  return { vote, matchedBy };
}

type Overrides = {
  signals?: Partial<Signals>;
  settings?: Partial<Settings>;
  history?: Partial<VoteHistory>;
  existing?: ExistingVoteMatch | null;
  challenge?: Partial<EngineInput["challenge"]>;
  captcha?: Partial<EngineInput["captcha"]>;
};

function input(o: Overrides = {}): EngineInput {
  return {
    signals: { ...signals, ...o.signals, fpQuality: { ...signals.fpQuality, ...o.signals?.fpQuality } },
    settings: { ...settings, ...o.settings },
    history: { ...history, ...o.history },
    existing: o.existing ?? null,
    challenge: { ok: true, ageMs: 5000, ...o.challenge },
    captcha: { configured: false, provided: false, verified: null, ...o.captcha },
  };
}

function expectReject(d: ReturnType<typeof decide>, code: string, httpStatus: number) {
  expect(d.kind).toBe("reject");
  if (d.kind !== "reject") return;
  expect(d.code).toBe(code);
  expect(d.httpStatus).toBe(httpStatus);
  expect(d.message.length).toBeGreaterThan(0);
}

/* ───────────── Tests ───────────── */

describe("decide()", () => {
  it("voto limpio -> accept valid con riesgo 0", () => {
    const d = decide(input());
    expect(d).toEqual({ kind: "accept", status: "valid", risk: 0, reasons: [] });
  });

  it("votación cerrada -> 403 VOTING_CLOSED (antes que cualquier otra regla)", () => {
    const d = decide(input({ settings: { voting_open: false }, challenge: { ok: false, reason: "expired" } }));
    expectReject(d, "VOTING_CLOSED", 403);
    if (d.kind === "reject") expect(d.outcome).toBe("voting_closed");
  });

  it("challenge inválido -> 403 BAD_CHALLENGE con la razón", () => {
    const d = decide(input({ challenge: { ok: false, reason: "expired", ageMs: 999999 }, existing: match("cookie_id") }));
    expectReject(d, "BAD_CHALLENGE", 403);
    if (d.kind === "reject") {
      expect(d.outcome).toBe("bad_challenge");
      expect(d.reasons).toEqual(["bad_challenge", "expired"]);
    }
  });

  it("cookie repetida -> 409 razón cookie", () => {
    const d = decide(input({ existing: match("cookie_id", "voter_key") }));
    expectReject(d, "ALREADY_VOTED", 409);
    if (d.kind === "reject") {
      expect(d.outcome).toBe("duplicate");
      expect(d.reasons).toEqual(["cookie"]);
    }
  });

  it("storage repetido -> 409 razón storage", () => {
    const d = decide(input({ existing: match("storage_id") }));
    expectReject(d, "ALREADY_VOTED", 409);
    if (d.kind === "reject") expect(d.reasons).toEqual(["storage"]);
  });

  it("voter_key repetido -> 409 razón device+headers", () => {
    const d = decide(input({ existing: match("voter_key", "device_fp") }));
    expectReject(d, "ALREADY_VOTED", 409);
    if (d.kind === "reject") expect(d.reasons).toEqual(["device+headers"]);
  });

  it("device_fp repetido con strict_device_match=true -> 409 razón device", () => {
    const d = decide(input({ existing: match("device_fp") }));
    expectReject(d, "ALREADY_VOTED", 409);
    if (d.kind === "reject") expect(d.reasons).toEqual(["device"]);
  });

  it("device_fp repetido con strict_device_match=false -> accept en cuarentena con riesgo device_match (45)", () => {
    const d = decide(input({ existing: match("device_fp"), settings: { strict_device_match: false } }));
    expect(d.kind).toBe("accept");
    if (d.kind !== "accept") return;
    expect(d.reasons).toContain("device_match");
    expect(d.risk).toBe(RISK.device_match);
    // Aunque 45 < umbral (60), el posible duplicado entra siempre en cuarentena (§3/§6 del doc).
    expect(d.status).toBe("suspect");
  });

  it("device_fp repetido (strict=false) entra en cuarentena aunque el umbral sea muy alto", () => {
    const d = decide(
      input({ existing: match("device_fp"), settings: { strict_device_match: false, suspect_threshold: 999 } }),
    );
    expect(d.kind).toBe("accept");
    if (d.kind === "accept") expect(d.status).toBe("suspect");
  });

  it("device_fp repetido (strict=false) + otras señales débiles -> suspect", () => {
    const d = decide(
      input({
        existing: match("device_fp"),
        settings: { strict_device_match: false },
        signals: { cookieId: null, storageId: null },
      }),
    );
    expect(d.kind).toBe("accept");
    if (d.kind !== "accept") return;
    expect(d.status).toBe("suspect");
    expect(d.risk).toBe(RISK.device_match + RISK.no_cookie + RISK.no_storage);
    expect(d.reasons).toEqual(["device_match", "no_cookie", "no_storage"]);
  });

  it("un voto previo rechazado no bloquea", () => {
    const d = decide(input({ existing: { vote: { ...vote, status: "rejected" }, matchedBy: ["cookie_id"] } }));
    expect(d.kind).toBe("accept");
  });

  it("ipVotesDish24h >= ip_hard_limit -> 429", () => {
    const d = decide(input({ history: { ipVotesDish24h: 8 } }));
    expectReject(d, "RATE_LIMITED", 429);
    if (d.kind === "reject") {
      expect(d.outcome).toBe("rate_limited");
      expect(d.reasons).toContain("ip_hard_limit");
    }
  });

  it("ipVotesAll10m >= 15 -> 429", () => {
    const d = decide(input({ history: { ipVotesAll10m: LIMITS.ipVotesAll10mHard } }));
    expectReject(d, "RATE_LIMITED", 429);
    if (d.kind === "reject") expect(d.reasons).toContain("ip_votes_10m");
  });

  it("ipAttempts10m >= 30 -> 429", () => {
    const d = decide(input({ history: { ipAttempts10m: LIMITS.ipAttempts10mHard } }));
    expectReject(d, "RATE_LIMITED", 429);
    if (d.kind === "reject") expect(d.reasons).toContain("ip_attempts_10m");
  });

  it("límites blandos de red suman riesgo sin rechazar", () => {
    const d = decide(
      input({ history: { ipVotesDish24h: 3, ipVotesAll10m: 6, subnetVotesDish1h: 20, voterAttempts10m: 5 } }),
    );
    expect(d.kind).toBe("accept");
    if (d.kind !== "accept") return;
    expect(d.reasons).toEqual(["ip_shared", "ip_burst", "subnet_burst", "voter_retry"]);
    expect(d.risk).toBe(RISK.ip_shared + RISK.ip_burst + RISK.subnet_burst + RISK.voter_retry);
    expect(d.status).toBe("suspect");
  });

  it("los duplicados se evalúan antes que el rate limit", () => {
    const d = decide(input({ existing: match("cookie_id"), history: { ipVotesDish24h: 50 } }));
    expectReject(d, "ALREADY_VOTED", 409);
  });

  it("UA de bot + huella débil -> accept suspect", () => {
    const d = decide(
      input({ signals: { botUa: true, fpQuality: { hasCanvas: false, hasWebgl: false, versionOk: true } } }),
    );
    expect(d.kind).toBe("accept");
    if (d.kind !== "accept") return;
    expect(d.status).toBe("suspect");
    expect(d.reasons).toEqual(["weak_fp", "bot_ua"]);
    expect(d.risk).toBe(RISK.weak_fp + RISK.bot_ua);
  });

  it("solo canvas o solo webgl no cuenta como huella débil", () => {
    const d = decide(input({ signals: { fpQuality: { hasCanvas: false, hasWebgl: true, versionOk: true } } }));
    expect(d.kind).toBe("accept");
    if (d.kind === "accept") expect(d.reasons).not.toContain("weak_fp");
  });

  it("versión desconocida, respuesta rápida, sin cookie y sin storage suman riesgo", () => {
    const d = decide(
      input({
        signals: { cookieId: null, storageId: null, fpQuality: { hasCanvas: true, hasWebgl: true, versionOk: false } },
        challenge: { ok: true, ageMs: 2000 },
      }),
    );
    expect(d.kind).toBe("accept");
    if (d.kind !== "accept") return;
    expect(d.reasons).toEqual(["fp_version", "too_fast", "no_cookie", "no_storage"]);
    expect(d.risk).toBe(RISK.fp_version + RISK.too_fast + RISK.no_cookie + RISK.no_storage);
    expect(d.status).toBe("suspect");
  });

  it("captcha configurado sin token -> 403 CAPTCHA_REQUIRED", () => {
    const d = decide(input({ captcha: { configured: true, provided: false, verified: null } }));
    expectReject(d, "CAPTCHA_REQUIRED", 403);
    if (d.kind === "reject") expect(d.outcome).toBe("rejected");
  });

  it("captcha fallido -> 403 CAPTCHA_FAILED", () => {
    const d = decide(input({ captcha: { configured: true, provided: true, verified: false } }));
    expectReject(d, "CAPTCHA_FAILED", 403);
  });

  it("captcha verificado -> accept", () => {
    const d = decide(input({ captcha: { configured: true, provided: true, verified: true } }));
    expect(d.kind).toBe("accept");
  });

  it("captcha no configurado ignora el token", () => {
    const d = decide(input({ captcha: { configured: false, provided: true, verified: null } }));
    expect(d.kind).toBe("accept");
  });

  it("los duplicados y el rate limit tienen prioridad sobre el captcha", () => {
    const dup = decide(input({ existing: match("voter_key"), captcha: { configured: true, provided: false, verified: null } }));
    expectReject(dup, "ALREADY_VOTED", 409);
    const rl = decide(input({ history: { ipVotesDish24h: 8 }, captcha: { configured: true, provided: false, verified: null } }));
    expectReject(rl, "RATE_LIMITED", 429);
  });

  it("respeta suspect_threshold configurable", () => {
    const d = decide(input({ settings: { suspect_threshold: 10 }, signals: { cookieId: null } }));
    expect(d.kind).toBe("accept");
    if (d.kind === "accept") expect(d.status).toBe("suspect");
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, cookieOptions, issueCookieValue, parseCookieValue } from "./cookie";

beforeAll(() => {
  process.env.VOTE_SECRET = "secreto-de-pruebas";
});

describe("cookie bl_vid", () => {
  it("emite un valor firmado y lo vuelve a leer", () => {
    const { id, value } = issueCookieValue();
    expect(COOKIE_NAME).toBe("bl_vid");
    expect(value.startsWith(`${id}.`)).toBe(true);
    expect(parseCookieValue(value)).toBe(id);
  });

  it("rechaza valores manipulados, vacíos o sin firma", () => {
    const { id, value } = issueCookieValue();
    expect(parseCookieValue(null)).toBeNull();
    expect(parseCookieValue("")).toBeNull();
    expect(parseCookieValue(id)).toBeNull();
    expect(parseCookieValue(`${id}.`)).toBeNull();
    expect(parseCookieValue(`${value}x`)).toBeNull();
    const otherId = "11111111-2222-4333-8444-555555555555";
    expect(parseCookieValue(`${otherId}.${value.split(".")[1]}`)).toBeNull();
  });

  it("cambia de secreto => la firma deja de ser válida", () => {
    const { value } = issueCookieValue();
    const prev = process.env.VOTE_SECRET;
    process.env.VOTE_SECRET = "otro-secreto";
    expect(parseCookieValue(value)).toBeNull();
    process.env.VOTE_SECRET = prev;
  });

  it("opciones: httpOnly, lax, path /, 400 días", () => {
    const opts = cookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(COOKIE_MAX_AGE_SECONDS);
    expect(COOKIE_MAX_AGE_SECONDS).toBe(400 * 86400);
  });
});

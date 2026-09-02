import { beforeAll, describe, expect, it } from "vitest";
import type { ClientFingerprint } from "@/lib/types";
import { FP_VERSION } from "@/lib/fingerprint/components";
import { deriveSignals, expandIpv6, getClientIp, isBotUa, normalizeIp, subnetOf } from "./signals";

beforeAll(() => {
  process.env.VOTE_SECRET = "secreto-de-pruebas";
});

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

function headers(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "user-agent": CHROME_UA,
    "accept-language": "es-CO,es;q=0.9",
    "sec-ch-ua": '"Chromium";v="128"',
    "sec-ch-ua-platform": '"Windows"',
    "sec-ch-ua-mobile": "?0",
    "x-forwarded-for": "190.1.2.3, 10.0.0.1",
    ...extra,
  });
}

function fp(overrides: Partial<ClientFingerprint["components"]> = {}, storageId: string | null = "sid-1"): ClientFingerprint {
  return {
    version: FP_VERSION,
    storageId,
    components: {
      canvas: "abc",
      webglVendor: "Google Inc.",
      webglRenderer: "ANGLE (NVIDIA)",
      screenWidth: 1920,
      screenHeight: 1080,
      colorDepth: 24,
      dpr: 1,
      cores: 8,
      memory: 8,
      platform: "Windows",
      touch: 0,
      timezone: "America/Bogota",
      fonts: "Arial,Calibri",
      audio: 124.043,
      ua: CHROME_UA,
      languages: "es-CO,es",
      ...overrides,
    },
  };
}

describe("IP y subred", () => {
  it("toma la primera IP de x-forwarded-for y cae a x-real-ip / cf-connecting-ip", () => {
    expect(getClientIp(headers())).toBe("190.1.2.3");
    expect(getClientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(getClientIp(new Headers({ "cf-connecting-ip": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(getClientIp(new Headers())).toBe("0.0.0.0");
  });

  it("normaliza puertos, corchetes e IPv4 mapeadas", () => {
    expect(normalizeIp("1.2.3.4:5555")).toBe("1.2.3.4");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("::ffff:9.8.7.6")).toBe("9.8.7.6");
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(normalizeIp("no-es-ip")).toBeNull();
  });

  it("subred /24 para IPv4 y /64 para IPv6", () => {
    expect(subnetOf("190.1.2.3")).toBe("190.1.2.0/24");
    expect(subnetOf("2001:db8:abcd:12:1:2:3:4")).toBe("2001:0db8:abcd:0012::/64");
    expect(subnetOf("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(subnetOf("0.0.0.0")).toBe("0.0.0.0/24");
  });

  it("expande IPv6 comprimidas", () => {
    expect(expandIpv6("::1")).toEqual(["0000", "0000", "0000", "0000", "0000", "0000", "0000", "0001"]);
    expect(expandIpv6("fe80::")).toEqual(["fe80", "0000", "0000", "0000", "0000", "0000", "0000", "0000"]);
    expect(expandIpv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(expandIpv6("1::2::3")).toBeNull();
  });
});

describe("deriveSignals", () => {
  it("produce hashes hex y nunca expone valores en claro", () => {
    const s = deriveSignals({ headers: headers(), fp: fp(), cookieId: "c1" });
    for (const h of [s.voterKey, s.deviceFp, s.clientFp, s.serverFp, s.ipHash, s.subnetHash]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(s.cookieId).toBe("c1");
    expect(s.storageId).toBe("sid-1");
    expect(s.ua).toBe(CHROME_UA);
    expect(s.botUa).toBe(false);
    expect(s.fpQuality).toEqual({ hasCanvas: true, hasWebgl: true, versionOk: true });
  });

  it("device_fp ignora UA e idiomas; client_fp y server_fp no", () => {
    const a = deriveSignals({ headers: headers(), fp: fp(), cookieId: null });
    const b = deriveSignals({
      headers: headers({ "user-agent": "Mozilla/5.0 Firefox/130.0", "sec-ch-ua": "" }),
      fp: fp({ ua: "Mozilla/5.0 Firefox/130.0", languages: "en-US" }),
      cookieId: null,
    });
    expect(a.deviceFp).toBe(b.deviceFp);
    expect(a.clientFp).not.toBe(b.clientFp);
    expect(a.serverFp).not.toBe(b.serverFp);
    expect(a.voterKey).not.toBe(b.voterKey);
  });

  it("es estable ante el orden de las claves y mayúsculas/espacios", () => {
    const a = deriveSignals({ headers: headers(), fp: fp(), cookieId: null });
    const shuffled = fp();
    shuffled.components = Object.fromEntries(Object.entries(shuffled.components).reverse());
    shuffled.components.platform = "  WINDOWS ";
    const b = deriveSignals({ headers: headers(), fp: shuffled, cookieId: null });
    expect(a.deviceFp).toBe(b.deviceFp);
    expect(a.voterKey).toBe(b.voterKey);
  });

  it("cambiar hardware cambia device_fp y voter_key", () => {
    const a = deriveSignals({ headers: headers(), fp: fp(), cookieId: null });
    const b = deriveSignals({ headers: headers(), fp: fp({ canvas: "otro" }), cookieId: null });
    expect(a.deviceFp).not.toBe(b.deviceFp);
    expect(a.voterKey).not.toBe(b.voterKey);
  });

  it("misma IP => mismo ip_hash; misma /24 => mismo subnet_hash", () => {
    const a = deriveSignals({ headers: headers({ "x-forwarded-for": "190.1.2.3" }), fp: fp(), cookieId: null });
    const b = deriveSignals({ headers: headers({ "x-forwarded-for": "190.1.2.77" }), fp: fp(), cookieId: null });
    expect(a.ipHash).not.toBe(b.ipHash);
    expect(a.subnetHash).toBe(b.subnetHash);
  });

  it("detecta calidad de huella y versión", () => {
    const weak = deriveSignals({
      headers: headers(),
      fp: { ...fp({ canvas: null, webglVendor: null, webglRenderer: "" }), version: 99 },
      cookieId: null,
    });
    expect(weak.fpQuality).toEqual({ hasCanvas: false, hasWebgl: false, versionOk: false });
    expect(weak.storageId).toBe("sid-1");
    const noStorage = deriveSignals({ headers: headers(), fp: fp({}, null), cookieId: null });
    expect(noStorage.storageId).toBeNull();
  });

  it("país desde x-vercel-ip-country o cf-ipcountry", () => {
    expect(deriveSignals({ headers: headers({ "x-vercel-ip-country": "co" }), fp: fp(), cookieId: null }).country).toBe("CO");
    expect(deriveSignals({ headers: headers({ "cf-ipcountry": "MX" }), fp: fp(), cookieId: null }).country).toBe("MX");
    expect(deriveSignals({ headers: headers(), fp: fp(), cookieId: null }).country).toBeNull();
  });
});

describe("isBotUa", () => {
  it("marca clientes HTTP, headless, bots y UA vacío", () => {
    for (const ua of ["curl/8.0", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120", "Googlebot/2.1", "PostmanRuntime/7", "", "   ", "Java/17"]) {
      expect(isBotUa(ua)).toBe(true);
    }
  });

  it("no marca navegadores normales", () => {
    expect(isBotUa(CHROME_UA)).toBe(false);
    expect(isBotUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
  });
});

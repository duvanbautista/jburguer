import type { NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SEEDED_HEADER,
  cookieOptions,
  issueCookieValue,
  parseCookieValue,
} from "@/lib/antifraud/cookie";
import { challengeRequestSchema } from "@/lib/antifraud/schemas";
import { issueChallengeFor } from "@/lib/antifraud/vote-service";
import type { ChallengeResponse } from "@/lib/types";
import { errorJson, internalError, isUuid, json, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/vote/challenge  body: ChallengeRequest -> ChallengeResponse
 * Si el navegador no trae una cookie bl_vid válida, se siembra aquí: se reutiliza
 * la que el proxy emitió en esta misma petición (SEEDED_HEADER) o se emite una nueva.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return errorJson("BAD_REQUEST", 400, "El cuerpo debe ser JSON válido.");
    const parsed = challengeRequestSchema.safeParse(body.data);
    if (!parsed.success) return errorJson("BAD_REQUEST", 400, "Datos de la solicitud inválidos.");
    const { dishId, fp } = parsed.data;
    if (!isUuid(dishId)) return errorJson("DISH_NOT_FOUND", 404);

    let cookieId = parseCookieValue(request.cookies.get(COOKIE_NAME)?.value);
    let seeded: string | null = null;
    if (!cookieId) {
      const fromProxy = request.headers.get(SEEDED_HEADER);
      const proxyId = parseCookieValue(fromProxy);
      if (fromProxy && proxyId) {
        cookieId = proxyId;
        seeded = fromProxy;
      } else {
        const issued = issueCookieValue();
        cookieId = issued.id;
        seeded = issued.value;
      }
    }

    const result = await issueChallengeFor({ headers: request.headers, fp, cookieId, dishId });
    if (!result) return errorJson("DISH_NOT_FOUND", 404);

    const response = json<ChallengeResponse>(result);
    if (seeded) response.cookies.set(COOKIE_NAME, seeded, cookieOptions());
    return response;
  } catch (err) {
    return internalError("POST /api/vote/challenge", err);
  }
}

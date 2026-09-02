import type { NextRequest } from "next/server";
import { COOKIE_NAME, parseCookieValue } from "@/lib/antifraud/cookie";
import { voteRequestSchema } from "@/lib/antifraud/schemas";
import { castVote } from "@/lib/antifraud/vote-service";
import type { VoteResponse } from "@/lib/types";
import { errorJson, internalError, isUuid, json, readJsonBody } from "../../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/dishes/[id]/vote  body: VoteRequest
 *  200 VoteSuccessResponse | 409 ALREADY_VOTED | 429 RATE_LIMITED
 *  403 BAD_CHALLENGE | VOTING_CLOSED | CAPTCHA_REQUIRED | CAPTCHA_FAILED | 404 DISH_NOT_FOUND | 400 BAD_REQUEST
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return errorJson("DISH_NOT_FOUND", 404);

    const body = await readJsonBody(request);
    if (!body.ok) return errorJson("BAD_REQUEST", 400, "El cuerpo debe ser JSON válido.");
    const parsed = voteRequestSchema.safeParse(body.data);
    if (!parsed.success) return errorJson("BAD_REQUEST", 400, "Datos de la solicitud inválidos.");
    const { challenge, fp, turnstileToken } = parsed.data;

    const cookieId = parseCookieValue(request.cookies.get(COOKIE_NAME)?.value);
    const result = await castVote({ headers: request.headers, fp, cookieId, dishId: id, challenge, turnstileToken });
    return json<VoteResponse>(result.body, { status: result.httpStatus });
  } catch (err) {
    return internalError("POST /api/dishes/[id]/vote", err);
  }
}

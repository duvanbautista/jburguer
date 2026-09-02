import { getDb } from "@/lib/db";
import type { Settings } from "@/lib/types";
import { internalError, json } from "../_lib/http";

export const dynamic = "force-dynamic";

export type PublicSettings = Pick<Settings, "festival_name" | "edition" | "tagline" | "voting_open">;

/** GET /api/settings -> ajustes públicos (sin umbrales antifraude). */
export async function GET() {
  try {
    const db = await getDb();
    const s = await db.getSettings();
    return json<PublicSettings>({
      festival_name: s.festival_name,
      edition: s.edition,
      tagline: s.tagline,
      voting_open: s.voting_open,
    });
  } catch (err) {
    return internalError("GET /api/settings", err);
  }
}

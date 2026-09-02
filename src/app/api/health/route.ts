import { getDb } from "@/lib/db";
import { internalError, json } from "../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/health -> { ok: true, mode: 'supabase' | 'memory' } */
export async function GET() {
  try {
    const db = await getDb();
    return json({ ok: true as const, mode: db.kind });
  } catch (err) {
    return internalError("GET /api/health", err);
  }
}

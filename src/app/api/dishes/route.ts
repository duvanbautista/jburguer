import { getDb } from "@/lib/db";
import type { DishWithRestaurant } from "@/lib/types";
import { internalError, json } from "../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/dishes -> { dishes: DishWithRestaurant[] } (solo publicados, por votos válidos desc). */
export async function GET() {
  try {
    const db = await getDb();
    const dishes = await db.listPublishedDishes();
    const sorted = [...dishes].sort(
      (a, b) => b.votes_count - a.votes_count || a.name.localeCompare(b.name, "es"),
    );
    return json<{ dishes: DishWithRestaurant[] }>({ dishes: sorted });
  } catch (err) {
    return internalError("GET /api/dishes", err);
  }
}

import { getDb } from "@/lib/db";
import type { DishWithRestaurant } from "@/lib/types";
import { errorJson, internalError, isUuid, json } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/dishes/[id] -> { dish: DishWithRestaurant } | 404 DISH_NOT_FOUND */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return errorJson("DISH_NOT_FOUND", 404);
    const db = await getDb();
    const dish = await db.getPublishedDish(id);
    if (!dish) return errorJson("DISH_NOT_FOUND", 404);
    return json<{ dish: DishWithRestaurant }>({ dish });
  } catch (err) {
    return internalError("GET /api/dishes/[id]", err);
  }
}

import { z } from "zod";
import type { ChallengeResponse, DishWithRestaurant, VoteResponse } from "@/lib/types";

/* Validación de lo que llega por red (API propia y Realtime). Nunca se confía en `any`. */

const RestaurantLiteSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  logo_url: z.string().nullable(),
  instagram: z.string().nullable(),
});

export const DishWithRestaurantSchema = z.object({
  id: z.string(),
  restaurant_id: z.string(),
  name: z.string(),
  inspired_by: z.string(),
  story: z.string(),
  ingredients: z.array(z.string()),
  image_url: z.string().nullable(),
  is_published: z.boolean(),
  votes_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  restaurant: RestaurantLiteSchema,
}) satisfies z.ZodType<DishWithRestaurant>;

export const DishesResponseSchema = z.object({ dishes: z.array(DishWithRestaurantSchema) });
export const DishResponseSchema = z.object({ dish: DishWithRestaurantSchema });

/** Fila de `dishes` recibida por Realtime (solo los campos que nos interesan). */
export const DishRowPatchSchema = z.object({
  id: z.string(),
  votes_count: z.number().optional(),
  is_published: z.boolean().optional(),
  name: z.string().optional(),
  inspired_by: z.string().optional(),
  image_url: z.string().nullable().optional(),
});
export type DishRowPatch = z.infer<typeof DishRowPatchSchema>;

export const ChallengeResponseSchema = z.object({
  challenge: z.string(),
  ttl: z.number(),
  alreadyVoted: z.boolean(),
  votingOpen: z.boolean(),
}) satisfies z.ZodType<ChallengeResponse>;

export const VoteResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    status: z.enum(["valid", "suspect"]),
    votes_count: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      "ALREADY_VOTED",
      "RATE_LIMITED",
      "BAD_CHALLENGE",
      "VOTING_CLOSED",
      "CAPTCHA_REQUIRED",
      "CAPTCHA_FAILED",
      "DISH_NOT_FOUND",
      "BAD_REQUEST",
    ]),
    message: z.string(),
  }),
]) satisfies z.ZodType<VoteResponse>;

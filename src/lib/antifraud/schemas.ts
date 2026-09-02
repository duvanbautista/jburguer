/**
 * Esquemas zod para los cuerpos de la API pública de votación.
 * Límites conservadores: la huella es un objeto pequeño y acotado.
 */
import { z } from "zod";
import type { ChallengeRequest, ClientFingerprint, VoteRequest } from "@/lib/types";

const MAX_COMPONENT_KEYS = 60;
const MAX_COMPONENT_STRING = 512;
const MAX_KEY_LENGTH = 64;

/** UUID o identificador similar (hex y guiones). */
const uuidish = z.string().regex(/^[0-9a-f-]{8,64}$/i, "storageId inválido");

const componentValueSchema = z.union([z.string().max(MAX_COMPONENT_STRING), z.number(), z.boolean(), z.null()]);

export const clientFingerprintSchema = z.object({
  components: z
    .record(z.string().min(1).max(MAX_KEY_LENGTH), componentValueSchema)
    .refine((c) => Object.keys(c).length <= MAX_COMPONENT_KEYS, { message: "Demasiados componentes" }),
  storageId: uuidish.nullable().default(null),
  version: z.number().int().min(0).max(10_000),
}) satisfies z.ZodType<ClientFingerprint, unknown>;

export const challengeRequestSchema = z.object({
  dishId: z.string().min(1).max(64),
  fp: clientFingerprintSchema,
}) satisfies z.ZodType<ChallengeRequest, unknown>;

export const voteRequestSchema = z.object({
  challenge: z.string().min(1).max(2048),
  fp: clientFingerprintSchema,
  turnstileToken: z.string().max(4096).optional(),
}) satisfies z.ZodType<VoteRequest, unknown>;

export type ParsedChallengeRequest = z.infer<typeof challengeRequestSchema>;
export type ParsedVoteRequest = z.infer<typeof voteRequestSchema>;

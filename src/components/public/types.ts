import type { Settings } from "@/lib/types";

/** Subconjunto de ajustes que se puede enviar al navegador (sin umbrales antifraude). */
export type PublicSettings = Pick<Settings, "festival_name" | "edition" | "tagline" | "voting_open">;

export function toPublicSettings(s: Settings): PublicSettings {
  return {
    festival_name: s.festival_name,
    edition: s.edition,
    tagline: s.tagline,
    voting_open: s.voting_open,
  };
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { Hero } from "@/components/public/Hero";
import { HowItWorks } from "@/components/public/HowItWorks";
import { Leaderboard } from "@/components/public/Leaderboard";
import { toPublicSettings } from "@/components/public/types";

export const metadata: Metadata = {
  title: "Ranking en vivo",
  description:
    "Los platos del festival ordenados por los votos del público, actualizados en vivo. Busca tu favorito y vota.",
};

export default async function HomePage() {
  // Sin caché: el ranking se calcula en cada petición.
  await connection();
  const db = await getDb();
  const [dishes, settings] = await Promise.all([db.listPublishedDishes(), db.getSettings()]);
  const publicSettings = toPublicSettings(settings);

  return (
    <main id="contenido" className="flex-1 pb-8">
      <Hero settings={publicSettings} dishCount={dishes.length} />
      <Leaderboard initialDishes={dishes} settings={publicSettings} />
      <HowItWorks />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { getDb } from "@/lib/db";
import type { DishWithRestaurant } from "@/lib/types";
import { DishImage } from "@/components/public/DishImage";
import { DishVotePanel } from "@/components/public/DishVotePanel";
import { InstagramIcon } from "@/components/public/InstagramIcon";

type Props = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una sola consulta por petición, compartida entre generateMetadata y la página. */
const loadDish = cache(async (id: string): Promise<DishWithRestaurant | null> => {
  if (!UUID_RE.test(id)) return null; // evita errores de Postgres con ids basura
  const db = await getDb();
  return db.getPublishedDish(id);
});

function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function paragraphs(story: string): string[] {
  return story
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function instagramHandle(value: string): string {
  return value.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dish = await loadDish(id);
  if (!dish) return { title: "Plato no encontrado" };

  const title = `${dish.name} · ${dish.restaurant.name}`;
  const description = `${dish.name} de ${dish.restaurant.name} (${dish.restaurant.city}), inspirada en ${dish.inspired_by}. ${excerpt(dish.story, 140)}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: dish.image_url ? [{ url: dish.image_url, alt: dish.name }] : undefined,
    },
  };
}

export default async function DishPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const dish = await loadDish(id);
  if (!dish) notFound();

  const db = await getDb();
  const settings = await db.getSettings();
  const story = paragraphs(dish.story);
  const handle = dish.restaurant.instagram ? instagramHandle(dish.restaurant.instagram) : null;
  const alt = `${dish.name}, hamburguesa de ${dish.restaurant.name}`;

  return (
    <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Todos los platos
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        {/* Hero: la foto en grande con viñeta (el sticky va en un contenedor aparte:
            next/image con `fill` exige un padre `relative`). La viñeta va sobre la
            foto: se mantiene oscura y con texto blanco en ambos temas. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <figure className="relative aspect-4/5 overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-line md:aspect-3/4">
            <DishImage src={dish.image_url} alt={alt} sizes="(min-width: 1024px) 50vw, 100vw" priority />
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent"
            />
            <figcaption className="glass-photo absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-2xl p-4 text-sm text-white/85 text-glow">
              <MapPin className="size-4 shrink-0 text-brand-soft" aria-hidden />
              <span>
                Inspirada en <span className="font-semibold text-white">{dish.inspired_by}</span>
              </span>
            </figcaption>
          </figure>
        </div>

        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
            <span className="text-fg">{dish.restaurant.name}</span>
            <span aria-hidden>·</span>
            <span>{dish.restaurant.city}</span>
            {handle && (
              <a
                href={`https://instagram.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram de ${dish.restaurant.name} (se abre en una pestaña nueva)`}
                className="inline-flex items-center gap-1.5 rounded-full normal-case tracking-normal text-brand-text transition-colors hover:text-brand"
              >
                <InstagramIcon className="size-4" />@{handle}
              </a>
            )}
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {dish.name}
          </h1>

          <p className="mt-3 flex items-center gap-2 text-fg-muted">
            <MapPin className="size-4 shrink-0 text-brand" aria-hidden />
            <span>
              Inspirada en <span className="font-semibold text-fg">{dish.inspired_by}</span>
            </span>
          </p>

          <DishVotePanel
            dishId={dish.id}
            dishName={dish.name}
            initialVotes={dish.votes_count}
            votingOpen={settings.voting_open}
            className="mt-8"
          />

          {story.length > 0 && (
            <section aria-labelledby="historia" className="mt-10">
              <h2 id="historia" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">
                La historia
              </h2>
              {story.map((p, i) => (
                <p key={i} className="mt-4 text-lg leading-relaxed text-fg/80 text-pretty">
                  {p}
                </p>
              ))}
            </section>
          )}

          {dish.ingredients.length > 0 && (
            <section aria-labelledby="ingredientes" className="mt-10">
              <h2 id="ingredientes" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">
                Ingredientes
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {dish.ingredients.map((ingredient) => (
                  <li
                    key={ingredient}
                    className="rounded-full border border-line bg-soft px-3.5 py-1.5 text-sm text-fg/85 backdrop-blur"
                  >
                    {ingredient}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

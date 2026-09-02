import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import type { DishWithRestaurant } from "@/lib/types";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { DishImage } from "./DishImage";
import { RankBadge } from "./RankBadge";
import { VoteCount } from "./VoteCount";

interface Props {
  dish: DishWithRestaurant;
  rank: number;
  /** `podium` = tarjeta destacada del top 3 (tipografía mayor, numeral grande). */
  variant?: "grid" | "podium";
  votingOpen: boolean;
  /** Carga prioritaria de la imagen (above the fold). */
  priority?: boolean;
}

/**
 * Viñeta: la foto ocupa toda la tarjeta, degradado a negro en la base y una
 * banda de vidrio oscuro con ranking, restaurante, plato, inspiración y votos.
 * Al ir sobre la foto, la viñeta se mantiene oscura y con texto blanco en
 * ambos temas (glass-photo). Toda la tarjeta es un único enlace accesible.
 */
export function DishCard({ dish, rank, variant = "grid", votingOpen, priority = false }: Props) {
  const podium = variant === "podium";
  const cta = votingOpen ? "Ver y votar" : "Ver plato";
  const alt = `${dish.name}, hamburguesa de ${dish.restaurant.name}`;

  return (
    <article
      className={cn(
        "group relative aspect-4/5 overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-line",
        "transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:ring-brand/40 md:aspect-3/4",
        podium && "lg:aspect-3/4",
      )}
    >
      <Link
        href={`/plato/${dish.id}`}
        aria-label={`${cta}: ${dish.name} de ${dish.restaurant.name}, puesto ${rank}`}
        className="absolute inset-0 block rounded-3xl focus-visible:outline-offset-[-3px]"
      >
        <DishImage
          src={dish.image_url}
          alt={alt}
          priority={priority}
          sizes={
            podium
              ? "(min-width: 768px) 33vw, 100vw"
              : "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          }
          className="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />

        {/* Viñeta: transparente arriba, casi opaco abajo; se aclara al pasar el cursor. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black/95 via-black/45 to-black/5 transition-opacity duration-300 group-hover:opacity-85"
        />

        {podium && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-3 right-3 select-none text-[7.5rem] font-black leading-none text-white/10 text-glow sm:text-[9rem]"
          >
            {rank}
          </span>
        )}

        <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
          <RankBadge rank={rank} size={podium ? "lg" : "md"} />
        </div>

        {/* Banda de vidrio oscuro (siempre, va sobre la foto). */}
        <div className="glass-photo absolute inset-x-3 bottom-3 rounded-2xl p-4 sm:inset-x-4 sm:bottom-4 sm:p-5">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 text-glow">
            {dish.restaurant.name} · {dish.restaurant.city}
          </p>
          <h3
            className={cn(
              "mt-1 font-black leading-tight text-white text-glow",
              podium ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
            )}
          >
            {dish.name}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/70 text-glow">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Inspirada en {dish.inspired_by}</span>
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-white text-glow">
              <Heart className="size-4 fill-brand text-brand" aria-hidden />
              <VoteCount value={dish.votes_count} className={cn("font-bold", podium && "text-lg")} />
              <span className="text-sm text-white/70">votos</span>
            </span>
            <span
              aria-hidden
              className={buttonClasses({
                size: "sm",
                className: "group-hover:from-brand-soft group-hover:to-brand",
              })}
            >
              {cta}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

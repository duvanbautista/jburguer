import Image from "next/image";
import { Utensils } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isOptimizableImageSrc } from "@/lib/images";

interface Props {
  src: string | null;
  alt: string;
  /** Atributo `sizes` de next/image (obligatorio con `fill`). */
  sizes: string;
  priority?: boolean;
  className?: string;
}

/**
 * Foto del plato ocupando todo su contenedor (el padre debe ser `relative`).
 * Se optimizan las rutas locales y las de Supabase Storage (declaradas en
 * `images.remotePatterns` de next.config.ts); otros orígenes remotos se sirven
 * sin optimizar para no fallar en tiempo de ejecución.
 */
export function DishImage({ src, alt, sizes, priority = false, className }: Props) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn("absolute inset-0 grid place-items-center bg-linear-to-br from-surface-2 to-bg", className)}
      >
        <Utensils className="size-12 text-fg/25" aria-hidden />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!isOptimizableImageSrc(src)}
      className={cn("object-cover", className)}
    />
  );
}

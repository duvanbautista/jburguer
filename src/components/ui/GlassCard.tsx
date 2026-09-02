import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "./cn";

type GlassTone = "dark" | "light" | "brand";

const tones: Record<GlassTone, string> = {
  dark: "bg-glass border-line",
  light: "bg-soft border-line",
  brand: "bg-brand/10 border-brand/30",
};

type GlassCardProps<T extends ElementType> = {
  as?: T;
  tone?: GlassTone;
  padded?: boolean;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * Panel de vidrio que sigue al tema (backdrop-blur + borde sutil). Primitivo
 * genérico, sin dependencias de datos: reutilizable en vista pública y panel admin.
 */
export function GlassCard<T extends ElementType = "div">({
  as,
  tone = "light",
  padded = true,
  className,
  children,
  ...rest
}: GlassCardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "rounded-2xl border backdrop-blur-md shadow-card",
        tones[tone],
        padded && "p-5 sm:p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

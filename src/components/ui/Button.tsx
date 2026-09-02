import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap " +
  "transition-[transform,box-shadow,background-color,color] duration-200 select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 active:enabled:scale-[0.98]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-r from-brand to-brand-deep text-white shadow-glow " +
    "hover:enabled:from-brand-soft hover:enabled:to-brand hover:enabled:shadow-[0_0_0_1px_rgb(255_122_26/0.5),0_14px_44px_-10px_rgb(255_122_26/0.7)]",
  secondary: "border border-line bg-soft text-fg backdrop-blur hover:enabled:bg-soft-2",
  ghost: "bg-transparent text-fg/80 hover:enabled:bg-soft-2 hover:enabled:text-fg",
  danger: "bg-ember/90 text-white hover:enabled:bg-ember",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

/** Clases de botón reutilizables (para enlaces o elementos que parecen botón). */
export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(base, variants[opts.variant ?? "primary"], sizes[opts.size ?? "md"], opts.className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra un spinner y deshabilita el botón. */
  loading?: boolean;
  children?: ReactNode;
}

/** Botón genérico del sistema de diseño. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Enlace de Next con apariencia de botón. */
export function ButtonLink({ variant = "primary", size = "md", className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}

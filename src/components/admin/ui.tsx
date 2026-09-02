import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Primitivos visuales del panel admin. Usan solo tokens semánticos del tema
 * (bg-surface, bg-soft, text-fg, border-line, bg-brand…): funcionan en claro y oscuro.
 * Son componentes de servidor: sin hooks ni estado. Los que necesitan
 * interactividad viven en archivos propios con "use client".
 */

/** Une clases condicionales sin dependencias externas. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ───────────── Panel de vidrio (sigue al tema) ───────────── */
export function GlassCard({ className, children, ...rest }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cx("rounded-2xl border border-line bg-soft backdrop-blur-md", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

/* ───────────── Badge ───────────── */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-soft text-fg/80",
  accent: "border-brand/30 bg-brand/15 text-brand-text",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ───────────── Botones ───────────── */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-soft",
  secondary: "border border-line bg-soft text-fg hover:bg-soft-2",
  ghost: "text-fg/80 hover:bg-soft hover:text-fg",
  danger: "border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-200",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}

/* ───────────── Campos de formulario ───────────── */
const FIELD_BASE =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

export function Input({ className, ...rest }: ComponentPropsWithoutRef<"input">) {
  return <input className={cx(FIELD_BASE, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "min-h-24 resize-y", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentPropsWithoutRef<"select">) {
  return <select className={cx(FIELD_BASE, className)} {...rest} />;
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-fg-subtle">{help}</p>
      ) : null}
    </div>
  );
}

/**
 * Switch accesible sin JavaScript: checkbox oculto + pista estilizada con `peer`.
 * Funciona sin controlar (`defaultChecked`) o controlado (`checked` + `onChange`) desde un componente cliente.
 */
export function Switch({
  name,
  label,
  description,
  defaultChecked,
  checked,
  onChange,
  id,
}: {
  name: string;
  label: string;
  description?: ReactNode;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  id?: string;
}) {
  const inputId = id ?? `switch-${name}`;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
      <input
        id={inputId}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 inline-block h-6 w-11 shrink-0 rounded-full bg-fg/25 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">{description}</span> : null}
      </span>
    </label>
  );
}

/* ───────────── Mensajes ───────────── */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "danger" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-100",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-100",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-100",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}

/* ───────────── Cabecera de página ───────────── */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/* ───────────── Tablas ───────────── */
export function Table({ children, className, minWidth = "640px" }: { children: ReactNode; className?: string; minWidth?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-2xl border border-line bg-surface", className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      scope="col"
      className={cx("bg-soft px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle", className)}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: ComponentPropsWithoutRef<"td">) {
  return <td className={cx("border-t border-line px-4 py-3 align-middle text-fg", className)} {...rest} />;
}

/* ───────────── KPI y estados vacíos ───────────── */
export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  tone?: BadgeTone;
}) {
  const accent: Record<BadgeTone, string> = {
    neutral: "text-fg",
    accent: "text-brand-text",
    success: "text-emerald-700 dark:text-emerald-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-rose-700 dark:text-rose-300",
    info: "text-sky-700 dark:text-sky-300",
  };
  return (
    <GlassCard className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cx("mt-2 text-3xl font-semibold tabular-nums tracking-tight", accent[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}
    </GlassCard>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <GlassCard className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base font-medium text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassCard>
  );
}

/** Miniatura cuadrada con reserva cuando no hay imagen. */
export function Thumb({ src, alt, size = 48, className }: { src: string | null; alt: string; size?: number; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-soft",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URLs remotas (Storage) sin configurar remotePatterns
        <img src={src} alt={alt} width={size} height={size} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="text-[10px] text-fg-subtle">sin foto</span>
      )}
    </span>
  );
}

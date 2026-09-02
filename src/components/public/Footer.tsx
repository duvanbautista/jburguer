import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/** Pie de página con la nota técnica de la propuesta y el selector de tema. */
export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            <span>
              Propuesta técnica: votación con validación de dispositivo y red — sin cuentas.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Tema
            </span>
            <ThemeToggle />
          </div>
        </div>
        <p className="flex items-center gap-3">
          <Link href="/" className="font-semibold text-fg/80 hover:text-fg">
            Burger Liga
          </Link>
          <span aria-hidden>·</span>
          <span>{new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { Flame } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/#ranking", label: "Ranking" },
  { href: "/#como-votamos", label: "Cómo votamos" },
  { href: "/admin", label: "Panel" },
];

const linkClass =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-soft-2 hover:text-fg";

/**
 * Cabecera fija con logo tipográfico, navegación y selector de tema.
 * En móvil la navegación baja a una segunda fila desplazable para que nada
 * se desborde ni se corte; desde `sm` todo va en una sola fila.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Burger Liga, ir al inicio"
          className="group flex min-w-0 shrink items-center gap-2 rounded-lg sm:gap-2.5"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand to-ember shadow-glow transition-transform group-hover:rotate-6 sm:size-9">
            <Flame className="size-4 text-white sm:size-5" aria-hidden />
          </span>
          <span className="truncate text-base font-black tracking-tight text-fg sm:text-xl">
            BURGER <span className="text-brand-gradient">LIGA</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle compact />
        </div>
      </div>

      {/* Navegación móvil: fila propia, sin saltos de línea, desplazable si no cabe. */}
      <nav
        aria-label="Principal (móvil)"
        className="flex items-center gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className={`${linkClass} bg-soft text-xs`}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

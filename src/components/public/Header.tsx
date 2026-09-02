import Link from "next/link";
import { Flame } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/#ranking", label: "Ranking" },
  { href: "/#como-votamos", label: "Cómo votamos" },
  { href: "/admin", label: "Panel" },
];

/** Cabecera fija con logo tipográfico, navegación mínima y selector de tema. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Burger Liga, ir al inicio"
          className="group flex items-center gap-2.5 rounded-lg"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand to-ember shadow-glow transition-transform group-hover:rotate-6">
            <Flame className="size-5 text-white" aria-hidden />
          </span>
          <span className="text-lg font-black tracking-tight text-fg sm:text-xl">
            BURGER <span className="text-brand-gradient">LIGA</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3">
          <nav aria-label="Principal" className="flex items-center gap-0.5 sm:gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-2.5 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-soft-2 hover:text-fg sm:px-3"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle compact />
        </div>
      </div>
    </header>
  );
}

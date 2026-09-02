import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Flame, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { isAdmin } from "@/components/admin/scope";
import { Badge, buttonClasses } from "@/components/admin/ui";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { signOutAction } from "./actions";

// Sin metadata propia: el layout raíz ya aplica la plantilla "%s · Burger Liga" al título de cada página.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Sin sesión, requireSession redirige a /login.
  const session = await requireSession();
  const admin = isAdmin(session);
  const restaurant =
    !admin && session.profile.restaurant_id ? await (await getDb()).getRestaurant(session.profile.restaurant_id) : null;

  const items: NavItem[] = [
    { href: "/admin", label: "Resumen", icon: "dashboard" },
    { href: "/admin/platos", label: admin ? "Platos" : "Mis platos", icon: "dishes" },
    ...(admin ? [{ href: "/admin/restaurantes", label: "Restaurantes", icon: "restaurants" as const }] : []),
    { href: "/admin/votos", label: "Votos sospechosos", icon: "votes" },
    ...(admin ? [{ href: "/admin/ajustes", label: "Ajustes", icon: "settings" as const }] : []),
  ];

  const subtitle = admin ? "Organización del festival" : (restaurant?.name ?? "Sin restaurante asignado");

  return (
    <div className="flex min-h-screen flex-1 text-fg">
      <div className="flex w-full flex-col md:flex-row">
        {/* Barra lateral (horizontal en móvil) */}
        <aside className="flex flex-col border-b border-line bg-glass backdrop-blur md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
          <Link href="/admin" className="flex items-center gap-3 px-5 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/20 text-brand">
              <Flame className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-fg">Burger Liga</span>
              <span className="block text-[11px] uppercase tracking-wider text-fg-subtle">Panel de gestión</span>
            </span>
          </Link>

          <AdminNav items={items} />

          <div className="mt-auto hidden px-3 pb-4 md:block">
            <form action={signOutAction}>
              <button type="submit" className={buttonClasses("ghost", "md", "w-full justify-start")}>
                <LogOut className="h-4 w-4" aria-hidden />
                Cerrar sesión
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{session.user.email}</p>
              <p className="truncate text-xs text-fg-subtle">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={admin ? "accent" : "info"}>{admin ? "Administrador" : "Restaurante"}</Badge>
              <ThemeToggle compact />
              <Link href="/" className="hidden items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg sm:inline-flex">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Ver sitio
              </Link>
              <form action={signOutAction} className="md:hidden">
                <button type="submit" className={buttonClasses("ghost", "sm")} aria-label="Cerrar sesión">
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
              </form>
            </div>
          </header>

          <main id="contenido" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

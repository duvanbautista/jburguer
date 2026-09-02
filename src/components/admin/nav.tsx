"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, Store, ShieldAlert, Settings } from "lucide-react";
import { cx } from "./ui";

export type NavIcon = "dashboard" | "dishes" | "restaurants" | "votes" | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

// Los iconos se resuelven aquí porque un componente no es serializable como prop servidor -> cliente.
const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  dishes: UtensilsCrossed,
  restaurants: Store,
  votes: ShieldAlert,
  settings: Settings,
};

/** Navegación lateral del panel; resalta la sección activa según la ruta. */
export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand/15 text-brand-text" : "text-fg-muted hover:bg-soft hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

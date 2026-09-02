"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const HIDDEN_PREFIXES = ["/admin", "/login"];

/**
 * Oculta la cabecera y el pie públicos en el panel y en el login,
 * que llevan su propia interfaz. El resto del sitio los muestra.
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden) return null;
  return <>{children}</>;
}

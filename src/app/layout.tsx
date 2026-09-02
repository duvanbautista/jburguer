import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "@/components/public/Footer";
import { Header } from "@/components/public/Header";
import { PublicChrome } from "@/components/public/PublicChrome";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Burger Liga", template: "%s · Burger Liga" },
  description:
    "Festival de hamburguesas con votación pública en vivo. Un voto por dispositivo, validado por dispositivo y red, sin cuentas.",
  applicationName: "Burger Liga",
  openGraph: { type: "website", locale: "es_CO", siteName: "Burger Liga" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0d" },
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

/**
 * Aplica el tema guardado ANTES del primer pintado para evitar el parpadeo.
 * Si no hay preferencia guardada, no pone atributo y manda el sistema (automático).
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      className={`${inter.variable} h-full antialiased`}
      // El script inline puede añadir data-theme antes de hidratar: no es un error.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Saltar al contenido
        </a>
        <PublicChrome>
          <Header />
        </PublicChrome>
        {children}
        <PublicChrome>
          <Footer />
        </PublicChrome>
      </body>
    </html>
  );
}

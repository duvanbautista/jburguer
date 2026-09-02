import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import { getSession } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/db";
import { demoAdminEmail, demoAdminPassword } from "@/lib/db/demo-ids";
import { DEMO_PASSWORD, SEED_RESTAURANTS } from "@/lib/seed-data";
import { GlassCard } from "@/components/admin/ui";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LoginForm } from "./login-form";

// El layout raíz añade "· Burger Liga" mediante su plantilla de título.
export const metadata: Metadata = { title: "Iniciar sesión" };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-soft-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">{children}</code>;
}

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/admin");
  const demoMode = !hasSupabaseEnv();

  return (
    <main
      id="contenido"
      className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 text-fg"
    >
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
      <ThemeToggle className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6" />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/20 text-brand">
            <Flame className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Panel de Burger Liga</h1>
            <p className="mt-1 text-sm text-fg-muted">Acceso para la organización y los restaurantes participantes.</p>
          </div>
        </div>

        <GlassCard className="p-6 sm:p-8">
          <LoginForm />
        </GlassCard>

        {demoMode ? (
          <GlassCard className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-fg">Cuentas demo</h2>
              <span className="text-[11px] font-medium uppercase tracking-wider text-brand-text">Modo sin Supabase</span>
            </div>
            <p className="text-fg-muted">
              No hay Supabase configurado: los datos viven en memoria y se reinician al reiniciar el servidor.
            </p>
            <dl className="space-y-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Administración</dt>
                <dd className="mt-0.5">
                  <Code>{demoAdminEmail()}</Code> <span className="text-fg-subtle">/</span> <Code>{demoAdminPassword()}</Code>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Cualquier restaurante</dt>
                <dd className="mt-0.5">
                  <Code>&lt;slug&gt;@burgerliga.demo</Code> <span className="text-fg-subtle">/</span> <Code>{DEMO_PASSWORD}</Code>
                </dd>
              </div>
            </dl>
            <details className="text-xs text-fg-muted">
              <summary className="cursor-pointer text-fg/80">Ver slugs de los restaurantes demo</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {SEED_RESTAURANTS.map((r) => (
                  <li key={r.id}>
                    <Code>{r.slug}</Code>
                  </li>
                ))}
              </ul>
            </details>
          </GlassCard>
        ) : null}

        <p className="text-center text-xs text-fg-subtle">
          <Link href="/" className="transition-colors hover:text-fg">
            ← Volver al ranking público
          </Link>
        </p>
      </div>
    </main>
  );
}

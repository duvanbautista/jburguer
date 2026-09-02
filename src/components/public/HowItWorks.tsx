import { Fingerprint, ShieldCheck, Wifi } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

interface Item {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
}

const items: Item[] = [
  {
    icon: Fingerprint,
    title: "Un voto por dispositivo",
    text: "Calculamos en el servidor una huella del dispositivo y del navegador. Borrar la caché o abrir una ventana de incógnito no crea un votante nuevo.",
  },
  {
    icon: Wifi,
    title: "Validamos la red",
    text: "La IP y la subred solo suman riesgo, porque en un festival muchas personas comparten el wifi. Las ráfagas anormales se frenan o entran en cuarentena.",
  },
  {
    icon: ShieldCheck,
    title: "Sin cuentas, con revisión",
    text: "No pedimos registro. Los votos sospechosos no cuentan en el marcador hasta que un administrador los revisa.",
  },
];

/** Sección breve que explica la propuesta antifraude al público. */
export function HowItWorks() {
  return (
    <section
      id="como-votamos"
      aria-labelledby="como-votamos-title"
      className="mx-auto mt-20 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">Transparencia</p>
        <h2 id="como-votamos-title" className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
          Cómo votamos
        </h2>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, text }) => (
          <GlassCard as="li" key={title} className="flex flex-col gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-brand/15 text-brand">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-sm leading-relaxed text-fg-muted">{text}</p>
          </GlassCard>
        ))}
      </ul>
    </section>
  );
}

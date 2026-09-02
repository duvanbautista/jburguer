"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import type { Settings } from "@/lib/types";
import { initialFormState, type FormState } from "./form-state";
import { Alert, Field, GlassCard, Input, Switch, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

export function SettingsForm({
  settings,
  updatedAtLabel,
  action,
}: {
  settings: Settings;
  /** Fecha ya formateada en el servidor (formatear aquí provoca desajustes de hidratación entre ICU de Node y del navegador). */
  updatedAtLabel: string;
  action: ActionFn;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [values, setValues] = useState({
    festival_name: settings.festival_name,
    edition: settings.edition,
    tagline: settings.tagline,
    ip_soft_limit: String(settings.ip_soft_limit),
    ip_hard_limit: String(settings.ip_hard_limit),
    suspect_threshold: String(settings.suspect_threshold),
  });
  const [votingOpen, setVotingOpen] = useState(settings.voting_open);
  const [strict, setStrict] = useState(settings.strict_device_match);
  const errors = state.fieldErrors;

  const bind = (key: keyof typeof values) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="space-y-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <GlassCard className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-fg">Festival</h2>
          <p className="text-sm text-fg-subtle">Textos que se muestran en la portada pública.</p>
        </div>
        <Field label="Nombre del festival" htmlFor="festival_name" error={errors.festival_name}>
          <Input id="festival_name" name="festival_name" value={values.festival_name} onChange={bind("festival_name")} required maxLength={80} />
        </Field>
        <Field label="Edición" htmlFor="edition" error={errors.edition} help="Ej. «Séptima edición · Sabana Centro 2026».">
          <Input id="edition" name="edition" value={values.edition} onChange={bind("edition")} required maxLength={120} />
        </Field>
        <Field label="Lema" htmlFor="tagline" error={errors.tagline} help="Frase de bienvenida bajo el título.">
          <Textarea id="tagline" name="tagline" value={values.tagline} onChange={bind("tagline")} rows={3} required maxLength={300} />
        </Field>
        <Switch
          name="voting_open"
          label="Votación abierta"
          description="Si se cierra, la vista pública sigue mostrando el ranking pero cualquier intento de voto se rechaza con «Votación cerrada»."
          checked={votingOpen}
          onChange={setVotingOpen}
        />
      </GlassCard>

      <GlassCard className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-fg">Antifraude</h2>
          <p className="text-sm text-fg-subtle">
            Parámetros del motor de riesgo. Los cambios aplican a los votos nuevos; los ya registrados no se recalculan.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Límite suave por IP"
            htmlFor="ip_soft_limit"
            error={errors.ip_soft_limit}
            help="Votos por IP al mismo plato en 24 h a partir de los cuales el voto suma riesgo (+40) y puede entrar en cuarentena."
          >
            <Input id="ip_soft_limit" name="ip_soft_limit" type="number" inputMode="numeric" min={1} max={1000} step={1} value={values.ip_soft_limit} onChange={bind("ip_soft_limit")} required />
          </Field>
          <Field
            label="Límite duro por IP"
            htmlFor="ip_hard_limit"
            error={errors.ip_hard_limit}
            help="Votos por IP al mismo plato en 24 h a partir de los cuales se rechaza (429). El wifi del festival comparte IP: no lo pongas demasiado bajo."
          >
            <Input id="ip_hard_limit" name="ip_hard_limit" type="number" inputMode="numeric" min={1} max={1000} step={1} value={values.ip_hard_limit} onChange={bind("ip_hard_limit")} required />
          </Field>
        </div>

        <Field
          label="Umbral de cuarentena"
          htmlFor="suspect_threshold"
          error={errors.suspect_threshold}
          help="Riesgo acumulado a partir del cual un voto se marca como sospechoso y deja de contar hasta que lo revises (por defecto 60)."
          className="sm:max-w-xs"
        >
          <Input id="suspect_threshold" name="suspect_threshold" type="number" inputMode="numeric" min={1} max={500} step={1} value={values.suspect_threshold} onChange={bind("suspect_threshold")} required />
        </Field>

        <Switch
          name="strict_device_match"
          label={strict ? "Coincidencia de dispositivo: estricta" : "Coincidencia de dispositivo: flexible"}
          description={
            <>
              <strong className="text-fg">Estricta:</strong> si la huella de hardware coincide con un voto previo al mismo plato, se bloquea como
              duplicado aunque haya cambiado de navegador. Máxima protección, pero dos teléfonos idénticos (mismo modelo, sistema e idioma) pueden
              confundirse. <strong className="text-fg">Flexible:</strong> ese caso no se bloquea: entra en cuarentena con +45 de riesgo para
              revisión manual. Menos falsos positivos a cambio de más votos por revisar.
            </>
          }
          checked={strict}
          onChange={setStrict}
        />
      </GlassCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">Última actualización: {updatedAtLabel}</p>
        <SubmitButton>Guardar ajustes</SubmitButton>
      </div>
    </form>
  );
}

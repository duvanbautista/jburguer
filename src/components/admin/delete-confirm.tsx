"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { initialFormState, type FormState } from "./form-state";
import { Alert, Field, GlassCard, Input } from "./ui";
import { SubmitButton } from "./submit-button";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Zona de peligro: el botón solo se habilita cuando el usuario escribe el nombre
 * exacto del recurso. Sin window.confirm; el servidor vuelve a comprobar el nombre.
 */
export function DeleteConfirm({
  action,
  entityName,
  title,
  warning,
  buttonLabel = "Eliminar",
}: {
  action: ActionFn;
  entityName: string;
  title: string;
  warning?: string;
  buttonLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === entityName.trim().toLowerCase();

  return (
    <GlassCard className="border-rose-500/30 p-6">
      <h2 className="text-base font-semibold text-rose-700 dark:text-rose-200">{title}</h2>
      {warning ? <p className="mt-1 text-sm text-fg-muted">{warning}</p> : null}
      <form action={formAction} onReset={(e) => e.preventDefault()} className="mt-4 max-w-md space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Field label={`Escribe «${entityName}» para confirmar`} htmlFor="confirm" error={state.fieldErrors.confirm}>
          <Input
            id="confirm"
            name="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={entityName}
          />
        </Field>
        <SubmitButton variant="danger" disabled={!matches} pendingText="Eliminando…">
          <Trash2 className="h-4 w-4" aria-hidden />
          {buttonLabel}
        </SubmitButton>
      </form>
    </GlassCard>
  );
}

"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import { initialFormState } from "@/components/admin/form-state";
import { Alert, Field, Input } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialFormState);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="space-y-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Correo electrónico" htmlFor="email" error={state.fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@restaurante.com"
        />
      </Field>

      <Field label="Contraseña" htmlFor="password" error={state.fieldErrors.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton className="w-full" pendingText="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}

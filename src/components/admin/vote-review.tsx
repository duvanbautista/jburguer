"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { initialFormState, type FormState } from "./form-state";
import { Button, Input } from "./ui";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

/** Aprobar / rechazar un voto en cuarentena, con nota opcional. */
export function VoteReviewForm({ voteId, action }: { voteId: string; action: ActionFn }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="vote_id" value={voteId} />
      <Input name="note" placeholder="Nota (opcional)" maxLength={300} className="h-8 text-xs" aria-label="Nota de revisión" autoComplete="off" />
      <div className="flex gap-2">
        {/* El botón que envía aporta name=decision al FormData. */}
        <Button type="submit" name="decision" value="valid" size="sm" variant="secondary" disabled={pending}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Aprobar
        </Button>
        <Button type="submit" name="decision" value="rejected" size="sm" variant="danger" disabled={pending}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Rechazar
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-xs text-success">{state.success}</p> : null}
    </form>
  );
}

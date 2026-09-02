import type { ZodError } from "zod";

/**
 * Estado que devuelven las server actions del panel a `useActionState`.
 * Se mantiene plano y serializable: solo strings.
 */
export interface FormState {
  /** Error general (permisos, base de datos, etc.). */
  error: string | null;
  /** Errores por campo, indexados por el `name` del input. */
  fieldErrors: Record<string, string>;
  /** Mensaje de éxito cuando la acción no redirige. */
  success: string | null;
}

export const initialFormState: FormState = { error: null, fieldErrors: {}, success: null };

/** Convierte los issues de zod en un mapa campo -> primer mensaje. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

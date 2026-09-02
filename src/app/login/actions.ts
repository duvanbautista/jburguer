"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signInWithPassword } from "@/lib/auth";
import { fieldErrorsFrom, type FormState } from "@/components/admin/form-state";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Escribe tu correo.").pipe(z.email("El correo no es válido.")),
  password: z.string().min(1, "Escribe tu contraseña."),
});

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Inicia sesión con correo y contraseña; en éxito redirige al panel. */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsFrom(parsed.error), success: null };
  }

  let result: Awaited<ReturnType<typeof signInWithPassword>>;
  try {
    result = await signInWithPassword(parsed.data.email, parsed.data.password);
  } catch (e) {
    console.error("[login] error inesperado", e);
    return { error: "No se pudo iniciar sesión. Inténtalo de nuevo en unos segundos.", fieldErrors: {}, success: null };
  }

  if (!result.ok) {
    return { error: result.error || "Correo o contraseña incorrectos.", fieldErrors: {}, success: null };
  }

  // redirect lanza una excepción de control de flujo: debe ir fuera del try/catch.
  redirect("/admin");
}

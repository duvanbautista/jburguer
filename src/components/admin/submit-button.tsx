"use client";

import { useFormStatus } from "react-dom";
import type { ComponentPropsWithoutRef } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./ui";

/** Botón de envío que se deshabilita mientras la server action está en curso. */
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  disabled,
  ...rest
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...rest}>
      {pending ? pendingText : children}
    </Button>
  );
}

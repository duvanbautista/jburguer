"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Button } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Selector de imagen con vista previa local (URL.createObjectURL).
 * Valida tipo y tamaño en el cliente; el servidor vuelve a validar.
 */
export function ImageInput({
  name,
  currentUrl = null,
  removeName,
  aspect = "4 / 3",
  serverError,
}: {
  name: string;
  /** Imagen ya guardada (modo edición). */
  currentUrl?: string | null;
  /** Si se indica, muestra un checkbox para quitar la imagen actual. */
  removeName?: string;
  /** Relación de aspecto CSS de la vista previa. */
  aspect?: string;
  serverError?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Libera el object URL anterior cuando cambia o al desmontar.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Si el formulario se reinicia (React lo hace tras una acción), limpia la vista previa.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setPreview(null);
      setFileName(null);
      setError(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function reject(input: HTMLInputElement, message: string) {
    input.value = "";
    setPreview(null);
    setFileName(null);
    setError(message);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName(null);
      setError(null);
      return;
    }
    if (!ACCEPTED.has(file.type)) {
      reject(e.target, "Formato no admitido. Usa JPG, PNG, WebP o AVIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(e.target, `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es 5 MB.`);
      return;
    }
    setError(null);
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  }

  function clearSelection() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setFileName(null);
    setError(null);
  }

  const shown = preview ?? currentUrl;
  const message = serverError ?? error;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-dashed border-line-strong bg-glass" style={{ aspectRatio: aspect }}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o URL remota
          <img src={shown} alt="Vista previa" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-fg-subtle">Sin imagen</div>
        )}
        {preview && fileName ? (
          <span className="absolute left-2 top-2 max-w-[90%] truncate rounded-md bg-black/70 px-2 py-0.5 text-[11px] text-white">
            Nueva: {fileName}
          </span>
        ) : null}
      </div>

      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/*"
        onChange={onChange}
        className="block w-full text-xs text-fg-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-soft-2 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg hover:file:bg-fg/15"
      />
      <p className="text-xs text-fg-subtle">JPG, PNG, WebP o AVIF · máximo 5 MB.</p>

      {preview ? (
        <Button variant="ghost" size="sm" onClick={clearSelection}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Quitar selección
        </Button>
      ) : null}

      {message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}

      {currentUrl && removeName && !preview ? (
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" name={removeName} className="accent-brand" />
          Quitar la imagen actual
        </label>
      ) : null}
    </div>
  );
}

"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button, Input } from "./ui";

/**
 * Editor de ingredientes tipo "chips": Enter (o coma) añade, la X elimina.
 * El valor se envía como JSON en un input oculto con el nombre indicado.
 */
export function IngredientsEditor({ name = "ingredients", initial = [] }: { name?: string; initial?: string[] }) {
  const [items, setItems] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setItems((prev) => [...prev, value]);
    }
    setDraft("");
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // evita enviar el formulario
      add();
    }
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escribe un ingrediente y pulsa Enter"
          aria-label="Nuevo ingrediente"
          maxLength={60}
          autoComplete="off"
        />
        <Button variant="secondary" onClick={add} aria-label="Añadir ingrediente">
          <Plus className="h-4 w-4" aria-hidden />
          Añadir
        </Button>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Ingredientes añadidos">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 py-1 pl-3 pr-1.5 text-xs text-brand-text"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Quitar ${item}`}
                className="rounded-full p-0.5 text-brand-text transition-colors hover:bg-brand/30 hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">Aún no hay ingredientes.</p>
      )}
    </div>
  );
}

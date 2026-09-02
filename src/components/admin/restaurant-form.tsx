"use client";

import { useActionState, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { initialFormState, type FormState } from "./form-state";
import { Alert, Field, GlassCard, Input, LinkButton, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";
import { ImageInput } from "./image-input";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

/** Convierte "Sal & Brasa" en "sal-brasa". */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes y diéresis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function RestaurantForm({
  mode,
  action,
  restaurant = null,
}: {
  mode: "create" | "edit";
  action: ActionFn;
  restaurant?: Restaurant | null;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [name, setName] = useState(restaurant?.name ?? "");
  const [slug, setSlug] = useState(restaurant?.slug ?? "");
  // En creación, el slug se sugiere a partir del nombre hasta que el usuario lo edite a mano.
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [city, setCity] = useState(restaurant?.city ?? "");
  const [description, setDescription] = useState(restaurant?.description ?? "");
  const [instagram, setInstagram] = useState(restaurant?.instagram ?? "");
  const errors = state.fieldErrors;

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <GlassCard className="space-y-5 p-6">
          <Field label="Nombre" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" value={name} onChange={(e) => onNameChange(e.target.value)} required maxLength={80} autoComplete="organization" />
          </Field>

          <Field
            label="Slug"
            htmlFor="slug"
            error={errors.slug}
            help="Identificador en la URL y en el correo demo (<slug>@burgerliga.demo). Solo minúsculas, números y guiones."
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoComplete="off"
              className="font-mono"
            />
          </Field>

          <Field label="Ciudad" htmlFor="city" error={errors.city}>
            <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} required maxLength={60} placeholder="Ej. Zipaquirá" />
          </Field>

          <Field label="Descripción" htmlFor="description" error={errors.description} help="Una o dos frases que se muestran junto al nombre del restaurante.">
            <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={300} />
          </Field>

          <Field label="Instagram" htmlFor="instagram" error={errors.instagram} help="Usuario sin @ (también acepta la URL completa).">
            <Input id="instagram" name="instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={120} placeholder="lafraguaburgers" autoComplete="off" />
          </Field>
        </GlassCard>
      </div>

      <aside className="space-y-6">
        <GlassCard className="space-y-4 p-6">
          <Field label="Logo (opcional)" htmlFor="logo" error={errors.logo}>
            <ImageInput name="logo" currentUrl={restaurant?.logo_url ?? null} removeName={mode === "edit" ? "remove_logo" : undefined} aspect="1 / 1" />
          </Field>
        </GlassCard>

        <div className="flex flex-col gap-2">
          <SubmitButton pendingText={mode === "create" ? "Creando…" : "Guardando…"}>
            {mode === "create" ? "Crear restaurante" : "Guardar cambios"}
          </SubmitButton>
          <LinkButton href="/admin/restaurantes" variant="ghost">
            Cancelar
          </LinkButton>
        </div>
      </aside>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import type { DishWithRestaurant } from "@/lib/types";
import { initialFormState, type FormState } from "./form-state";
import { Alert, Field, GlassCard, Input, LinkButton, Select, Switch, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";
import { IngredientsEditor } from "./ingredients-editor";
import { ImageInput } from "./image-input";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

export interface DishFormProps {
  mode: "create" | "edit";
  action: ActionFn;
  dish?: DishWithRestaurant | null;
  /** Restaurantes seleccionables (solo admin). */
  restaurants: Array<{ id: string; name: string; city: string }>;
  /** Restaurante fijo para cuentas de restaurante: no se puede cambiar. */
  fixedRestaurant?: { id: string; name: string } | null;
}

export function DishForm({ mode, action, dish = null, restaurants, fixedRestaurant = null }: DishFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);
  // Campos controlados: así el formulario conserva lo escrito si el servidor devuelve errores.
  const [name, setName] = useState(dish?.name ?? "");
  const [inspiredBy, setInspiredBy] = useState(dish?.inspired_by ?? "");
  const [story, setStory] = useState(dish?.story ?? "");
  const [restaurantId, setRestaurantId] = useState(dish?.restaurant_id ?? fixedRestaurant?.id ?? restaurants[0]?.id ?? "");
  const [published, setPublished] = useState(dish?.is_published ?? false);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <GlassCard className="space-y-5 p-6">
          <Field label="Nombre del plato" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Ej. La Catedral"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Inspirado en (lugar / región / país)"
            htmlFor="inspired_by"
            error={errors.inspired_by}
            help="Aparece bajo el nombre en el ranking. Ej. «Catedral de Sal · Zipaquirá»."
          >
            <Input
              id="inspired_by"
              name="inspired_by"
              value={inspiredBy}
              onChange={(e) => setInspiredBy(e.target.value)}
              required
              maxLength={120}
              placeholder="Ej. Desierto de La Guajira · Cabo de la Vela"
              autoComplete="off"
            />
          </Field>

          <Field label="Historia" htmlFor="story" error={errors.story} help="Cuenta qué lugar representa el plato y por qué.">
            <Textarea
              id="story"
              name="story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              required
              rows={9}
              maxLength={2000}
              placeholder="¿Qué lugar representa este plato? ¿Qué ingredientes o técnicas lo conectan con él? ¿Por qué lo eligieron?"
            />
            <p className="text-right text-[11px] tabular-nums text-fg-subtle">{story.length}/2000</p>
          </Field>

          <Field label="Ingredientes" error={errors.ingredients} help="Escribe un ingrediente y pulsa Enter para añadirlo. Se muestran en la ficha del plato.">
            <IngredientsEditor name="ingredients" initial={dish?.ingredients ?? []} />
          </Field>
        </GlassCard>
      </div>

      <aside className="space-y-6">
        <GlassCard className="space-y-5 p-6">
          <Field label="Restaurante" htmlFor="restaurant_id" error={errors.restaurant_id}>
            {fixedRestaurant ? (
              <>
                <input type="hidden" name="restaurant_id" value={fixedRestaurant.id} />
                <Input id="restaurant_id" value={fixedRestaurant.name} disabled readOnly />
              </>
            ) : (
              <Select id="restaurant_id" name="restaurant_id" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} required>
                {restaurants.length === 0 ? <option value="">— No hay restaurantes —</option> : null}
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.city}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Imagen del plato" htmlFor="image" error={errors.image}>
            <ImageInput name="image" currentUrl={dish?.image_url ?? null} removeName={mode === "edit" ? "remove_image" : undefined} />
          </Field>

          <Switch
            name="is_published"
            label="Publicado"
            description="Solo los platos publicados aparecen en el ranking y pueden recibir votos."
            checked={published}
            onChange={setPublished}
          />
        </GlassCard>

        <div className="flex flex-col gap-2">
          <SubmitButton pendingText={mode === "create" ? "Creando…" : "Guardando…"}>
            {mode === "create" ? "Crear plato" : "Guardar cambios"}
          </SubmitButton>
          <LinkButton href="/admin/platos" variant="ghost">
            Cancelar
          </LinkButton>
        </div>
      </aside>
    </form>
  );
}

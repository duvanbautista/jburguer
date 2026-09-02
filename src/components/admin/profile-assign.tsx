"use client";

import { useActionState } from "react";
import type { Profile } from "@/lib/types";
import { initialFormState, type FormState } from "./form-state";
import { Badge, Button, Select, Table, Td, Th } from "./ui";

type ActionFn = (state: FormState, formData: FormData) => Promise<FormState>;

interface RestaurantOption {
  id: string;
  name: string;
}

/** Tabla de cuentas: cada fila es un formulario independiente (rol + restaurante). */
export function ProfileAssign({
  profiles,
  restaurants,
  currentUserId,
  action,
}: {
  profiles: Profile[];
  restaurants: RestaurantOption[];
  currentUserId: string;
  action: ActionFn;
}) {
  if (profiles.length === 0) {
    return <p className="text-sm text-fg-subtle">Todavía no hay cuentas registradas.</p>;
  }
  return (
    <Table minWidth="720px">
      <thead>
        <tr>
          <Th>Cuenta</Th>
          <Th>Rol</Th>
          <Th>Restaurante</Th>
          <Th className="text-right">Acción</Th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((p) => (
          <ProfileRow key={p.id} profile={p} restaurants={restaurants} isSelf={p.id === currentUserId} action={action} />
        ))}
      </tbody>
    </Table>
  );
}

function ProfileRow({
  profile,
  restaurants,
  isSelf,
  action,
}: {
  profile: Profile;
  restaurants: RestaurantOption[];
  isSelf: boolean;
  action: ActionFn;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const formId = `profile-${profile.id}`;
  // La clave fuerza el remontaje de los selects cuando el servidor devuelve datos nuevos.
  const dataKey = `${profile.role}:${profile.restaurant_id ?? ""}`;

  return (
    <tr>
      <Td>
        {/* Los controles de las otras celdas se asocian a este formulario con el atributo `form`. */}
        <form id={formId} action={formAction}>
          <input type="hidden" name="id" value={profile.id} />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg">{profile.email}</span>
          {isSelf ? <Badge tone="accent">tú</Badge> : null}
        </div>
        {state.error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p className="mt-1 text-xs text-success">{state.success}</p> : null}
      </Td>
      <Td>
        <Select key={`role-${dataKey}`} form={formId} name="role" defaultValue={profile.role} aria-label={`Rol de ${profile.email}`} className="min-w-36">
          <option value="admin">Administrador</option>
          <option value="restaurant">Restaurante</option>
        </Select>
      </Td>
      <Td>
        <Select
          key={`rest-${dataKey}`}
          form={formId}
          name="restaurant_id"
          defaultValue={profile.restaurant_id ?? ""}
          aria-label={`Restaurante de ${profile.email}`}
          className="min-w-48"
        >
          <option value="">— Sin restaurante —</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Td>
      <Td className="text-right">
        <Button type="submit" form={formId} size="sm" variant="secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </Td>
    </tr>
  );
}

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { saveSettings } from "../actions";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireAdmin();
  const db = await getDb();
  const settings = await db.getSettings();

  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Textos del festival, apertura de la votación y parámetros del motor antifraude."
      />
      <div className="max-w-3xl">
        <SettingsForm settings={settings} updatedAtLabel={formatDate(settings.updated_at)} action={saveSettings} />
      </div>
    </>
  );
}

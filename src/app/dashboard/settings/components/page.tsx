import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PicklistAddForm } from "@/components/picklist-add-form";
import { PicklistItemChip } from "@/components/picklist-item-chip";
import { ImportUnlistedNames } from "@/components/import-unlisted-names";
import { findUnlistedDcNames } from "@/lib/actions/dc-picklists";

export const metadata: Metadata = { title: "Component & Material Settings | Oviya Engineers" };

export default async function DcPicklistSettingsPage() {
  const supabase = await createClient();
  const { data: items } = await supabase.from("dc_picklist_items").select("*").order("name");

  const components = (items ?? []).filter((i) => i.kind === "component");
  const materials = (items ?? []).filter((i) => i.kind === "material");
  const unlisted = await findUnlistedDcNames();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Component &amp; Material Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage the dropdown options used on Delivery Challan item rows.
        </p>
      </div>

      <ImportUnlistedNames components={unlisted.components} materials={unlisted.materials} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PicklistAddForm kind="component" label="Component" />
            <div className="flex flex-wrap gap-2">
              {components.length === 0 && (
                <p className="text-sm text-muted-foreground">No components added yet.</p>
              )}
              {components.map((c) => (
                <PicklistItemChip key={c.id} id={c.id} name={c.name} kind="component" />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Materials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PicklistAddForm kind="material" label="Material" />
            <div className="flex flex-wrap gap-2">
              {materials.length === 0 && (
                <p className="text-sm text-muted-foreground">No materials added yet.</p>
              )}
              {materials.map((m) => (
                <PicklistItemChip key={m.id} id={m.id} name={m.name} kind="material" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

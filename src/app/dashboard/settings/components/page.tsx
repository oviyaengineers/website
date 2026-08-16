import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PicklistAddForm } from "@/components/picklist-add-form";
import { DeletePicklistItemButton } from "@/components/delete-picklist-item-button";

export const metadata: Metadata = { title: "Component & Material Settings | Oviya Engineers" };

export default async function DcPicklistSettingsPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("dc_picklist_items")
    .select("*")
    .order("name");

  const components = (items ?? []).filter((i) => i.kind === "component");
  const materials = (items ?? []).filter((i) => i.kind === "material");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Component &amp; Material Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage the dropdown options used on Delivery Challan item rows.
        </p>
      </div>

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
                <span
                  key={c.id}
                  className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                >
                  {c.name}
                  <DeletePicklistItemButton id={c.id} name={c.name} />
                </span>
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
                <span
                  key={m.id}
                  className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                >
                  {m.name}
                  <DeletePicklistItemButton id={m.id} name={m.name} />
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

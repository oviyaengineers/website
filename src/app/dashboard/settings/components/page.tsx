import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PicklistAddForm } from "@/components/picklist-add-form";
import { PicklistItemChip } from "@/components/picklist-item-chip";
import { ImportUnlistedNames } from "@/components/import-unlisted-names";
import { DuplicatePicklistGroups } from "@/components/duplicate-picklist-groups";
import { findDuplicatePicklistNames, findUnlistedDcNames } from "@/lib/actions/dc-picklists";
import { SearchBox } from "@/components/search-box";

export const metadata: Metadata = { title: "Component & Material Settings | Oviya Engineers" };

export default async function DcPicklistSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const { data: items } = await supabase.from("dc_picklist_items").select("*").order("name");

  // Filtering only decides what is listed. Nothing is renamed, added or
  // removed by looking for it.
  const needle = q?.trim().toLowerCase() ?? "";
  const visible = needle
    ? (items ?? []).filter((i) => i.name.toLowerCase().includes(needle))
    : (items ?? []);
  const components = visible.filter((i) => i.kind === "component");
  const materials = visible.filter((i) => i.kind === "material");
  const [unlisted, duplicateComponents, duplicateMaterials] = await Promise.all([
    findUnlistedDcNames(),
    findDuplicatePicklistNames("component"),
    findDuplicatePicklistNames("material"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Component &amp; Material Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage the dropdown options used on Delivery Challan item rows.
        </p>
      </div>

      <SearchBox placeholder="Search component or material names..." />

      <ImportUnlistedNames components={unlisted.components} materials={unlisted.materials} />

      <DuplicatePicklistGroups kind="component" groups={duplicateComponents} />
      <DuplicatePicklistGroups kind="material" groups={duplicateMaterials} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PicklistAddForm kind="component" label="Component" />
            <div className="flex flex-wrap gap-2">
              {components.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {needle ? `No component matches "${q}".` : "No components added yet."}
                </p>
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
                <p className="text-sm text-muted-foreground">
                  {needle ? `No material matches "${q}".` : "No materials added yet."}
                </p>
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

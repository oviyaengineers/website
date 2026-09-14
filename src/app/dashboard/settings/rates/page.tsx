import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteRateButton, RateListForm } from "@/components/rate-list-form";
import { formatRupees } from "@/lib/billing";

export const metadata: Metadata = { title: "Rate List | Oviya Engineers" };

/**
 * Default billing rate per component and material, per piece. It fills the
 * rate on a new invoice and can be overridden there; issued invoices keep the
 * rate they were issued with.
 */
export default async function RateListPage() {
  const supabase = await createClient();
  const [{ data: rates }, { data: picklist }] = await Promise.all([
    supabase.from("component_rates").select("*"),
    supabase.from("dc_picklist_items").select("id, name, kind").order("name"),
  ]);
  const components = (picklist ?? []).filter((p) => p.kind === "component");
  const materials = (picklist ?? []).filter((p) => p.kind === "material").map((p) => p.name);
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const rows = (rates ?? [])
    .map((r) => ({ ...r, componentName: nameById.get(r.component_id) ?? "(removed component)" }))
    .sort(
      (a, b) =>
        a.componentName.localeCompare(b.componentName) || a.material.localeCompare(b.material)
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rate List</h1>
        <p className="text-sm text-muted-foreground">
          The default rate per piece for each component and material. It appears automatically when
          billing and can be changed on an individual invoice.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add or update a rate</CardTitle>
        </CardHeader>
        <CardContent>
          <RateListForm
            components={components.map((c) => ({ id: c.id, name: c.name }))}
            materials={materials}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">Component</th>
                <th className="px-3 py-2.5 text-left font-medium">Material</th>
                <th className="px-3 py-2.5 text-right font-medium">Rate per piece</th>
                <th className="px-3 py-2.5 text-left font-medium">HSN/SAC</th>
                <th className="px-3 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5">{row.componentName}</td>
                  <td className="px-3 py-2.5">{row.material || "(no material)"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    ₹{formatRupees(Number(row.rate))}
                  </td>
                  <td className="px-3 py-2.5">{row.hsn_sac ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <DeleteRateButton
                      id={row.id}
                      label={`${row.componentName} ${row.material}`.trim()}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No rates yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

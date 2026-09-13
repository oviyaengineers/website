import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { ScannedDcEditor } from "@/components/scanned-dc-editor";
import { getScanImageUrl, getScannedDc } from "@/lib/actions/dc-scan-queue";

export const metadata: Metadata = { title: "Scanned DC | Oviya Engineers" };

export default async function ScannedDcPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  const [scan, supabase] = await Promise.all([getScannedDc(id), createClient()]);
  if (!scan) notFound();

  const [{ data: picklist }, { data: customers }, imageUrl] = await Promise.all([
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    getScanImageUrl(scan.imagePath),
  ]);
  const editing = edit === "1" && scan.status === "pending";

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={scan.customerDcNumber ?? "Scanned DC"} />
      <div>
        <h1 className="text-2xl font-semibold">
          {editing ? "Edit " : ""}
          {scan.customerDcNumber || "Scanned customer DC"}
        </h1>
        <p className="text-sm text-muted-foreground">
          What the customer sent in. No delivery challan of ours exists until you create and save
          one.
        </p>
      </div>
      {/* Keyed on the mode, so leaving Edit resets any unsaved changes. */}
      <ScannedDcEditor
        key={editing ? "edit" : "view"}
        scan={scan}
        customers={customers ?? []}
        components={(picklist ?? []).filter((i) => i.kind === "component").map((i) => i.name)}
        materials={(picklist ?? []).filter((i) => i.kind === "material").map((i) => i.name)}
        imageUrl={imageUrl}
        editing={editing}
      />
    </div>
  );
}

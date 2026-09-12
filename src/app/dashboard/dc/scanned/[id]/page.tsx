import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { ScannedDcEditor } from "@/components/scanned-dc-editor";
import { getScannedDc } from "@/lib/actions/dc-scan-queue";

export const metadata: Metadata = { title: "Scanned DC | Oviya Engineers" };

export default async function ScannedDcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [scan, supabase] = await Promise.all([getScannedDc(id), createClient()]);
  if (!scan) notFound();

  const { data: picklist } = await supabase.from("dc_picklist_items").select("name, kind");

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={scan.customerDcNumber ?? "Scanned DC"} />
      <div>
        <h1 className="text-2xl font-semibold">{scan.customerDcNumber || "Scanned customer DC"}</h1>
        <p className="text-sm text-muted-foreground">
          What the customer sent in. No delivery challan of ours exists until you create one.
        </p>
      </div>
      <ScannedDcEditor
        scan={scan}
        components={(picklist ?? []).filter((i) => i.kind === "component").map((i) => i.name)}
        materials={(picklist ?? []).filter((i) => i.kind === "material").map((i) => i.name)}
      />
    </div>
  );
}

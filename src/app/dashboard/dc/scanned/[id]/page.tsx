import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { ScannedDcEditor } from "@/components/scanned-dc-editor";
import { getScanImageUrl, getScannedDc } from "@/lib/actions/dc-scan-queue";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcScan.scannedDc")} | Oviya Engineers` };
}

export default async function ScannedDcPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  const [scan, supabase, { t }] = await Promise.all([
    getScannedDc(id),
    createClient(),
    getTranslator(),
  ]);
  if (!scan) notFound();

  const [{ data: picklist }, { data: customers }, imageUrl] = await Promise.all([
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    getScanImageUrl(scan.imagePath),
  ]);
  const editing = edit === "1" && scan.status === "pending";
  const name = scan.customerDcNumber || t("dcScan.scannedCustomerDc");

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={scan.customerDcNumber ?? t("dcScan.scannedDc")} />
      <div>
        <h1 className="text-2xl font-semibold">
          {editing ? t("dcScan.editName", { name }) : name}
        </h1>
        <p className="text-sm text-muted-foreground">{t("dcScan.scannedDetailIntro")}</p>
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

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ScanDcPanel } from "@/components/scan-dc-panel";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcScan.scanTitle")} | Oviya Engineers` };
}

export default async function ScanDcPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: picklistItems }, { t }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("dc_picklist_items").select("*").order("name"),
    getTranslator(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dcScan.scanTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("dcScan.scanIntro")}</p>
      </div>
      <ScanDcPanel
        customers={customers ?? []}
        components={(picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name)}
        materials={(picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name)}
      />
    </div>
  );
}

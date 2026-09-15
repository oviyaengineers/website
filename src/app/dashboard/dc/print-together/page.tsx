import Link from "next/link";
import type { Metadata } from "next";
import { X } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PrintNowButton } from "@/components/print-now-button";
import {
  DcPrintSheet,
  MAX_PRINT_TOGETHER,
  type PrintChallan,
  type PrintItem,
} from "@/components/dc-print-sheet";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { dcQrCode } from "@/lib/dc-public-link";
import { getTranslator } from "@/lib/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("dcPrint.title") };
}

/**
 * Several of our challans for the same customer and date on one printed sheet.
 *
 * Print only: nothing is merged or changed. Each challan keeps its own DC
 * number, lines and QR code; the sheet simply lists them together, so one
 * printout can go with one delivery.
 */
export default async function DcPrintTogetherPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const wanted = [
    ...new Set(
      (ids ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => UUID.test(part))
    ),
  ];
  if (wanted.length === 0) notFound();

  const supabase = await createClient();
  const [{ data: found }, { lang, t }] = await Promise.all([
    supabase.from("delivery_challans").select("*").in("id", wanted).order("dc_number"),
    getTranslator(),
  ]);
  const dcs = found ?? [];
  if (dcs.length === 0) notFound();

  const valid =
    dcs.length === wanted.length &&
    dcs.length <= MAX_PRINT_TOGETHER &&
    new Set(dcs.map((dc) => dc.customer_id)).size === 1 &&
    new Set(dcs.map((dc) => dc.dc_date)).size === 1;

  const toolbar = (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-[#f4f6f9]/95 p-4 backdrop-blur print:hidden">
      <Button render={<Link href={`/dashboard/dc/${dcs[0].id}`} />} variant="outline">
        <X className="h-4 w-4" /> {t("common.close")}
      </Button>
      {valid && <PrintNowButton label={t("dcPrint.printSavePdf")} />}
    </div>
  );

  if (!valid) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033]">
        {toolbar}
        <p className="mx-auto mt-10 max-w-lg rounded-lg border bg-white p-6 text-center text-sm">
          {t("dcPrint.togetherInvalid", { max: MAX_PRINT_TOGETHER })}
        </p>
      </div>
    );
  }

  const dcIds = dcs.map((dc) => dc.id);
  const [{ data: items }, { data: customer }, { data: picklist }, qrs] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").in("dc_id", dcIds).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dcs[0].customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
    Promise.all(dcs.map((dc) => dcQrCode(supabase, dc.id))),
  ]);
  const componentNames = componentNameIndex(picklist ?? []);

  // Challan by challan, in DC number order, each in its own line order. Only
  // lines that moved are printed, exactly as on a single challan.
  const printItems: PrintItem[] = dcs.flatMap((dc) =>
    (items ?? [])
      .filter((i) => i.dc_id === dc.id)
      .filter(
        (i) =>
          (Number(i.sent_qty) || 0) +
            (Number(i.material_problem_qty) || 0) +
            (Number(i.rejection_qty) || 0) >
          0
      )
      .map((i) => ({
        ...i,
        component: componentNameOf(i, componentNames),
        dcNumber: dc.dc_number,
      }))
  );

  const challans: PrintChallan[] = dcs.map((dc, i) => ({
    id: dc.id,
    dcNumber: dc.dc_number,
    dcDate: dc.dc_date,
    customerDcNumber: dc.customer_dc_number,
    customerDcDate: dc.customer_dc_date,
    authorizedBy: dc.authorized_by,
    qrSvg: qrs[i]?.svg ?? null,
  }));

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      {toolbar}
      <div className="dc-print-stage">
        <DcPrintSheet
          challans={challans}
          customer={customer}
          items={printItems}
          lang={lang}
          t={t}
        />
      </div>
    </div>
  );
}

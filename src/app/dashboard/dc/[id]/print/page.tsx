import Link from "next/link";
import { Layers, X } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DcPrintActions } from "@/components/dc-print-actions";
import { DcPrintSheet, MAX_PRINT_TOGETHER, type PrintItem } from "@/components/dc-print-sheet";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { dcQrCode } from "@/lib/dc-public-link";
import { getTranslator } from "@/lib/i18n/server";

export default async function DcPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dc } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (!dc) notFound();

  const [
    { data: items },
    { data: customer },
    { data: picklist },
    { lang, t },
    qr,
    { data: sameDay },
  ] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
    getTranslator(),
    // The QR opens a public, read-only copy of this challan. Printing
    // still works without it if the link cannot be made.
    dcQrCode(supabase, id),
    // Other challans for the same customer on the same date, which can be
    // printed on this sheet together with this one.
    supabase
      .from("delivery_challans")
      .select("id, dc_number")
      .eq("customer_id", dc.customer_id)
      .eq("dc_date", dc.dc_date)
      .neq("id", id)
      .order("dc_number"),
  ]);
  // The printed challan is the document the customer signs, so it must carry
  // the part's current name rather than the spelling stored at entry.
  const componentNames = componentNameIndex(picklist ?? []);
  // Resolved once and used by both the printed sheet and the PDF, so the two
  // copies of the same document cannot name a part differently, or list
  // different parts.
  //
  // Only the lines with something entered on this challan are printed: a
  // quantity sent, returned with a material problem, or rejected. A challan
  // can carry a component that has not moved yet, and a row reading 0 on the
  // customer's copy says this despatch included a part it did not.
  const printItems: PrintItem[] = (items ?? [])
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
    }));

  const pdfData = {
    dc_number: dc.dc_number,
    dc_date: dc.dc_date,
    customer_dc_number: dc.customer_dc_number,
    customer_dc_date: dc.customer_dc_date,
    authorized_by: dc.authorized_by,
    customer,
    items: printItems,
    qr_png: qr?.png ?? null,
  };

  const others = sameDay ?? [];
  const canPrintTogether = others.length > 0 && others.length < MAX_PRINT_TOGETHER;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      {/* The overlay covers the whole app, so without this there is no way
          back to the challan short of the browser's own back button. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-[#f4f6f9]/95 p-4 backdrop-blur print:hidden">
        <Button render={<Link href={`/dashboard/dc/${dc.id}`} />} variant="outline">
          <X className="h-4 w-4" /> {t("common.close")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {canPrintTogether && (
            <Button
              render={
                <Link
                  href={`/dashboard/dc/print-together?ids=${[dc.id, ...others.map((o) => o.id)].join(",")}`}
                />
              }
              variant="outline"
            >
              <Layers className="h-4 w-4" />{" "}
              {t("dcPrint.printTogether", { dcs: others.map((o) => o.dc_number).join(", ") })}
            </Button>
          )}
          <DcPrintActions dc={pdfData} />
        </div>
      </div>

      {/* The sheet below is exactly the printable area of one A4 page, at the
          same size on screen as on paper. Anything that does not fit inside it
          here will not be on the printout either, which is the whole point of
          showing it. */}
      <div className="dc-print-stage">
        <DcPrintSheet
          challans={[
            {
              id: dc.id,
              dcNumber: dc.dc_number,
              dcDate: dc.dc_date,
              customerDcNumber: dc.customer_dc_number,
              customerDcDate: dc.customer_dc_date,
              authorizedBy: dc.authorized_by,
              qrSvg: qr?.svg ?? null,
            },
          ]}
          customer={customer}
          items={printItems}
          lang={lang}
          t={t}
        />
      </div>
    </div>
  );
}

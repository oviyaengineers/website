import Link from "next/link";
import { X } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DcPrintActions } from "@/components/dc-print-actions";
import type { CustomerRow, DeliveryChallanRow } from "@/types/database";
import { LogoMark } from "@/components/marketing/logo";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { formatDate } from "@/lib/i18n/dates";
import { getTranslator } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";

/** Rows shown in the items table, padded with blanks when a DC is short. */
const MIN_TABLE_ROWS = 4;

type PrintItem = {
  id: string;
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  total_qty: number;
};

export default async function DcPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dc } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (!dc) notFound();

  const [{ data: items }, { data: customer }, { data: picklist }, { lang, t }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
    getTranslator(),
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
    }));

  const pdfData = {
    dc_number: dc.dc_number,
    dc_date: dc.dc_date,
    customer_dc_number: dc.customer_dc_number,
    customer_dc_date: dc.customer_dc_date,
    authorized_by: dc.authorized_by,
    customer,
    items: printItems,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      {/* The overlay covers the whole app, so without this there is no way
          back to the challan short of the browser's own back button. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-[#f4f6f9]/95 p-4 backdrop-blur print:hidden">
        <Button render={<Link href={`/dashboard/dc/${dc.id}`} />} variant="outline">
          <X className="h-4 w-4" /> {t("common.close")}
        </Button>
        <div className="flex gap-2">
          <DcPrintActions dc={pdfData} />
        </div>
      </div>

      {/* The sheet below is exactly the printable area of one A4 page, at the
          same size on screen as on paper. Anything that does not fit inside it
          here will not be on the printout either, which is the whole point of
          showing it. */}
      <div className="dc-print-stage">
        <div className="dc-print-page">
          <DcCopy
            label={t("dcPrint.original")}
            dc={dc}
            customer={customer}
            items={printItems}
            lang={lang}
            t={t}
          />
          <div className="dc-print-cut my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400">
            <span className="relative -top-2 bg-white px-2">{t("dcPrint.cutHere")}</span>
          </div>
          <DcCopy
            label={t("dcPrint.duplicate")}
            dc={dc}
            customer={customer}
            items={printItems}
            lang={lang}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One ruled cell of the challan form: a small caption above its value.
 *
 * `tall` leaves room to sign by hand. The cell keeps its height whether or
 * not anything was typed into it, because a signature box that collapses when
 * empty is no use on a form somebody has to sign.
 */
function Field({
  label,
  span,
  tall = false,
  children,
}: {
  label: string;
  span: 1 | 2 | 4;
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`dc-print-cell${tall ? " dc-print-cell-tall" : ""}`}
      style={{ gridColumn: `span ${span}` }}
    >
      <p className="dc-print-cell-label">{label}</p>
      <div className="dc-print-cell-value">{children}</div>
    </div>
  );
}

/** Every cell of the items table: a plain ruled box, the same line as the form's. */
const CELL = "border border-[#222] p-1.5";

function DcCopy({
  label,
  dc,
  customer,
  items,
  lang,
  t,
}: {
  label: string;
  dc: DeliveryChallanRow;
  customer: CustomerRow | null;
  items: PrintItem[];
  lang: Lang;
  t: Translate;
}) {
  return (
    <div className="dc-print-sheet break-inside-avoid">
      {/* Plain ruled boxes throughout, with no filled band behind the company
          name and no tinted table headings, so the heading reads as one more
          box of the same form. */}
      <header className="relative mb-3 border border-[#222] bg-white px-6 py-3 text-[#172033] print:py-2">
        <div className="absolute right-4 top-4 text-xs">
          <p className="dc-print-copy-label border border-[#222] px-3 py-1 font-semibold tracking-wide">
            {label}
          </p>
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="dc-print-logo mb-1 flex h-12 w-16 items-center justify-center p-1">
            <LogoMark className="h-full w-full" />
          </div>
          <div className="dc-print-company text-xl font-bold tracking-wide">OVIYA ENGINEERS</div>
          <div className="mt-1 text-xs">
            40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
          </div>
          <div className="mt-0.5 text-xs">Ph: 9965902970, 9965702970</div>
        </div>
      </header>

      <section className="dc-print-block mb-3">
        <h2 className="dc-print-title mb-2 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          {t("dcPrint.title")}
        </h2>
        {/* Every field in its own ruled cell, the way a printed challan book
            is laid out: the container carries the top and left edges and each
            cell its right and bottom, so the rules meet with no doubling. */}
        <div className="dc-print-fields">
          <Field label={t("dcPrint.ourDcNumber")} span={1}>
            {dc.dc_number}
          </Field>
          <Field label={t("dcPrint.date")} span={1}>
            {formatDate(dc.dc_date, "dd MMM yyyy", lang)}
          </Field>
          <Field label={t("dcPrint.customerDcNumbers")} span={2}>
            {dc.customer_dc_number && dc.customer_dc_number.length > 0
              ? dc.customer_dc_number.map((num, i) => (
                  <span key={i} className="block">
                    {num || "-"}
                    {dc.customer_dc_date?.[i]
                      ? ` (${formatDate(dc.customer_dc_date[i] as string, "dd MMM yyyy", lang)})`
                      : ""}
                  </span>
                ))
              : "-"}
          </Field>
          <Field label={t("dcPrint.customerName")} span={2}>
            <span className="font-medium">{customer?.name ?? "-"}</span>
            {customer?.address ? <span className="block">{customer.address}</span> : null}
          </Field>
          <Field label={t("dcPrint.contactGst")} span={2}>
            {customer?.phone ? <span className="block">{customer.phone}</span> : null}
            {customer?.gst_number ? (
              <span className="block">{t("dcPrint.gst", { gst: customer.gst_number })}</span>
            ) : null}
            {!customer?.phone && !customer?.gst_number ? "-" : null}
          </Field>
        </div>
      </section>

      {/* No block border here: the table draws its own rules, and a bordered
          block around it printed as two concentric rectangles. The caption
          rides in the table's first row instead of floating above it. */}
      <section className="dc-print-block-flush mb-3">
        <div className="dc-print-table-wrap overflow-auto">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            {/* Widths live here, not on the header cells. The table is laid
                out fixed, so the first row decides the columns — and the first
                row is now the single merged caption, which squeezed the
                description down to a two-line wrap. A colgroup is immune to
                that. */}
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={7} className={`${CELL} text-center text-sm font-bold text-[#172033]`}>
                  {t("dcPrint.materialDetails")}
                </th>
              </tr>
              <tr>
                <th className={`${CELL} text-center`}>{t("dcPrint.sNo")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.description")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.material")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.qty")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.matProblem")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.rejection")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.total")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className={`${CELL} text-center`}>{idx + 1}</td>
                  <td className={`${CELL} text-center`}>{item.component}</td>
                  <td className={`${CELL} text-center`}>{item.material ?? "-"}</td>
                  {/* The "Qty" column on the printed challan is the sent quantity. */}
                  <td className={`${CELL} text-center`}>{item.sent_qty}</td>
                  <td className={`${CELL} text-center`}>{item.material_problem_qty}</td>
                  <td className={`${CELL} text-center`}>{item.rejection_qty}</td>
                  <td className={`${CELL} text-center`}>{item.total_qty}</td>
                </tr>
              ))}
              {/* Pad short challans out to a consistent form height, but never
                  add filler that would push the second copy onto page two. */}
              {Array.from({
                length: Math.max(0, MIN_TABLE_ROWS - items.length),
              }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                  <td className={CELL}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The standing note and both signatures share one ruled strip, so the
          foot of the challan reads as part of the same form rather than as
          three separate cards. */}
      <section className="dc-print-block dc-print-foot">
        <div className="dc-print-fields">
          <Field label={t("dcPrint.note")} span={4}>
            {t("dcPrint.noteText")}
          </Field>
          <Field label={t("dcPrint.receiverSignature")} span={2} tall>
            {""}
          </Field>
          <Field
            label={dc.authorized_by ? t("dcPrint.authorizedBy") : t("dcPrint.authorizedSignatory")}
            span={2}
            tall
          >
            {dc.authorized_by || ""}
          </Field>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { X } from "lucide-react";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DcPrintActions } from "@/components/dc-print-actions";
import type { CustomerRow, DeliveryChallanRow } from "@/types/database";
import { LogoMark } from "@/components/marketing/logo";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";

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

  const [{ data: items }, { data: customer }, { data: picklist }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);
  // The printed challan is the document the customer signs, so it must carry
  // the part's current name rather than the spelling stored at entry.
  const componentNames = componentNameIndex(picklist ?? []);
  // Resolved once and used by both the printed sheet and the PDF, so the two
  // copies of the same document cannot name a part differently.
  const printItems: PrintItem[] = (items ?? []).map((i) => ({
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
          <X className="h-4 w-4" /> Close
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
          <DcCopy label="ORIGINAL" dc={dc} customer={customer} items={printItems} />
          <div className="dc-print-cut my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400">
            <span className="relative -top-2 bg-[#f4f6f9] px-2 print:bg-white">✂ cut here</span>
          </div>
          <DcCopy label="DUPLICATE" dc={dc} customer={customer} items={printItems} />
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

function DcCopy({
  label,
  dc,
  customer,
  items,
}: {
  label: string;
  dc: DeliveryChallanRow;
  customer: CustomerRow | null;
  items: PrintItem[];
}) {
  return (
    <div className="dc-print-sheet break-inside-avoid">
      <header className="relative mb-3 rounded-t-2xl bg-[#10233f] px-6 py-3 text-white print:rounded-none print:py-2">
        <div className="absolute right-4 top-4 text-xs opacity-90">
          <p className="dc-print-copy-label rounded-full border border-white/40 px-3 py-1 font-semibold tracking-wide">
            {label}
          </p>
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="dc-print-logo mb-1 flex h-12 w-16 items-center justify-center rounded-lg bg-white/95 p-1">
            <LogoMark className="h-full w-full" />
          </div>
          <div className="dc-print-company text-xl font-bold tracking-wide">OVIYA ENGINEERS</div>
          <div className="mt-1 text-xs opacity-80">
            40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
          </div>
          <div className="mt-0.5 text-xs opacity-80">Ph: 9965902970, 9965702970</div>
        </div>
      </header>

      <section className="dc-print-block mb-3">
        <h2 className="dc-print-title mb-2 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          Delivery Challan
        </h2>
        {/* Every field in its own ruled cell, the way a printed challan book
            is laid out: the container carries the top and left edges and each
            cell its right and bottom, so the rules meet with no doubling. */}
        <div className="dc-print-fields">
          <Field label="Our DC Number" span={1}>
            {dc.dc_number}
          </Field>
          <Field label="Date" span={1}>
            {format(new Date(dc.dc_date), "dd MMM yyyy")}
          </Field>
          <Field label="Customer DC Number(s)" span={2}>
            {dc.customer_dc_number && dc.customer_dc_number.length > 0
              ? dc.customer_dc_number.map((num, i) => (
                  <span key={i} className="block">
                    {num || "-"}
                    {dc.customer_dc_date?.[i]
                      ? ` (${format(new Date(dc.customer_dc_date[i] as string), "dd MMM yyyy")})`
                      : ""}
                  </span>
                ))
              : "-"}
          </Field>
          <Field label="Customer Name" span={2}>
            <span className="font-medium">{customer?.name ?? "-"}</span>
            {customer?.address ? <span className="block">{customer.address}</span> : null}
          </Field>
          <Field label="Contact / GST" span={2}>
            {customer?.phone ? <span className="block">{customer.phone}</span> : null}
            {customer?.gst_number ? (
              <span className="block">GST: {customer.gst_number}</span>
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
              <col style={{ width: "8%" }} />
              <col style={{ width: "44%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  colSpan={6}
                  className="border border-[#222] bg-[#eef2f7] p-1.5 text-center text-sm font-bold text-[#172033]"
                >
                  Material / Component Details
                </th>
              </tr>
              <tr>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">S.No.</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">
                  Description
                </th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Qty</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">
                  Mat. Problem
                </th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">
                  Rejection
                </th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{idx + 1}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.component}</td>
                  {/* The "Qty" column on the printed challan is the sent quantity. */}
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.sent_qty}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">
                    {item.material_problem_qty}
                  </td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">
                    {item.rejection_qty}
                  </td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.total_qty}</td>
                </tr>
              ))}
              {/* Pad short challans out to a consistent form height, but never
                  add filler that would push the second copy onto page two. */}
              {Array.from({
                length: Math.max(0, MIN_TABLE_ROWS - items.length),
              }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
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
          <Field label="Note" span={4}>
            Sent after machining
          </Field>
          <Field label="Receiver's Signature" span={2} tall>
            {""}
          </Field>
          <Field label={dc.authorized_by ? "Authorized By" : "Authorized Signatory"} span={2} tall>
            {dc.authorized_by || ""}
          </Field>
        </div>
      </section>
    </div>
  );
}

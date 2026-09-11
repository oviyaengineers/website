import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      <div className="mx-auto flex max-w-4xl justify-end gap-2 p-4 print:hidden">
        <DcPrintActions dc={pdfData} />
      </div>

      <div className="dc-print-page mx-auto max-w-4xl pb-10 print:pb-0">
        <DcCopy label="ORIGINAL" dc={dc} customer={customer} items={printItems} />
        <div className="dc-print-cut my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400">
          <span className="relative -top-2 bg-[#f4f6f9] px-2 print:bg-white">✂ cut here</span>
        </div>
        <DcCopy label="DUPLICATE" dc={dc} customer={customer} items={printItems} />
      </div>
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

      <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <h2 className="dc-print-title mb-3 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          Delivery Challan
        </h2>
        <div className="dc-print-meta grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Our DC Number</p>
            <p>{dc.dc_number}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Date</p>
            <p>{format(new Date(dc.dc_date), "dd MMM yyyy")}</p>
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Customer DC Number(s)</p>
            {dc.customer_dc_number && dc.customer_dc_number.length > 0 ? (
              dc.customer_dc_number.map((num, i) => (
                <p key={i}>
                  {num || "-"}
                  {dc.customer_dc_date?.[i]
                    ? ` (${format(new Date(dc.customer_dc_date[i] as string), "dd MMM yyyy")})`
                    : ""}
                </p>
              ))
            ) : (
              <p>-</p>
            )}
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Customer Name</p>
            <p className="font-medium">{customer?.name ?? "-"}</p>
            <p className="text-gray-600">{customer?.address ?? ""}</p>
            <p className="text-gray-600">{customer?.phone ?? ""}</p>
            {customer?.gst_number && <p className="text-gray-600">GST: {customer.gst_number}</p>}
          </div>
        </div>
      </section>

      <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <div className="mb-2 text-center text-sm font-bold text-[#172033]">
          Material / Component Details
        </div>
        <div className="dc-print-table-wrap overflow-auto">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <thead>
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
              {Array.from({ length: Math.max(0, MIN_TABLE_ROWS - items.length) }).map((_, i) => (
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

      {/* Standing note printed on every challan. */}
      <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <p className="text-sm font-semibold text-[#172033]">Sent after machining</p>
      </section>

      <section className="rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <div className="dc-print-sign mt-4 flex justify-between text-xs">
          <div className="w-2/5 border-t border-black pt-1 text-center">
            Receiver&apos;s Signature
          </div>
          <div className="w-2/5 border-t border-black pt-1 text-center">
            {dc.authorized_by || "Authorized Signatory"}
          </div>
        </div>
      </section>
    </div>
  );
}

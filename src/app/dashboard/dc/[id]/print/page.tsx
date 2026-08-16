import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { DcPrintActions } from "@/components/dc-print-actions";
import type { CustomerRow, DeliveryChallanRow } from "@/types/database";

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

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
  ]);

  const pdfData = {
    dc_number: dc.dc_number,
    dc_date: dc.dc_date,
    customer_dc_number: dc.customer_dc_number,
    customer_dc_date: dc.customer_dc_date,
    job_order_no: dc.job_order_no,
    vehicle_number: dc.vehicle_number,
    authorized_by: dc.authorized_by,
    remarks: dc.remarks,
    customer,
    items: (items ?? []).map((i) => ({
      component: i.component,
      material: i.material,
      received_qty: i.received_qty,
      sent_qty: i.sent_qty,
      material_problem_qty: i.material_problem_qty,
      rejection_qty: i.rejection_qty,
      total_qty: i.total_qty,
    })),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      <div className="mx-auto flex max-w-4xl justify-end gap-2 p-4 print:hidden">
        <DcPrintActions dc={pdfData} />
      </div>

      <div className="mx-auto max-w-4xl pb-10 print:pb-0">
        <DcCopy label="ORIGINAL" dc={dc} customer={customer} items={items ?? []} />
        <div className="my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400 print:my-2 print:h-[6mm]">
          <span className="relative -top-2 bg-[#f4f6f9] px-2 print:bg-white">✂ cut here</span>
        </div>
        <DcCopy label="DUPLICATE" dc={dc} customer={customer} items={items ?? []} />
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
          <p className="rounded-full border border-white/40 px-3 py-1 font-semibold tracking-wide">
            {label}
          </p>
        </div>
        <div className="flex flex-col items-center text-center">
          {/* TODO: company logo goes here once available */}
          <div className="text-xl font-bold tracking-wide">OVIYA ENGINEERS</div>
          <div className="mt-1 text-xs opacity-80">
            40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
          </div>
          <div className="mt-0.5 text-xs opacity-80">Ph: 9965902970, 9965702970</div>
        </div>
      </header>

      <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <h2 className="mb-3 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          Delivery Challan
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Our DC Number</p>
            <p>{dc.dc_number}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Date</p>
            <p>{format(new Date(dc.dc_date), "dd MMM yyyy")}</p>
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">
              Customer DC Number(s)
            </p>
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
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Job Order / PO No.</p>
            <p>{dc.job_order_no ?? "-"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Vehicle No.</p>
            <p>{dc.vehicle_number ?? "-"}</p>
          </div>
        </div>
      </section>

      <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <div className="mb-2 text-center text-sm font-bold text-[#172033]">
          Material / Component Details
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">S.No.</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Description</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Material</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Received</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Sent</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Mat. Problem</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Rejection</th>
                <th className="border border-[#d9dee7] bg-[#eef2f7] p-1.5 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{idx + 1}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.component}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.material ?? ""}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.received_qty}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.sent_qty}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">
                    {item.material_problem_qty}
                  </td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.rejection_qty}</td>
                  <td className="border border-[#d9dee7] p-1.5 text-center">{item.total_qty}</td>
                </tr>
              ))}
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
                  <td className="border border-[#d9dee7] p-1.5">&nbsp;</td>
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

      {dc.remarks && (
        <section className="mb-3 rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
          <p className="mb-1 text-sm font-bold text-[#172033]">General Remarks</p>
          <p className="text-xs">{dc.remarks}</p>
        </section>
      )}

      <section className="rounded-2xl border border-transparent bg-white p-4 shadow-sm print:rounded-none print:border-[#222] print:p-3 print:shadow-none">
        <div className="mt-4 flex justify-between text-xs">
          <div className="w-2/5 border-t border-black pt-1 text-center">Receiver&apos;s Signature</div>
          <div className="w-2/5 border-t border-black pt-1 text-center">
            {dc.authorized_by || "Authorized Signatory"}
          </div>
        </div>
      </section>
    </div>
  );
}

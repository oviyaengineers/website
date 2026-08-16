import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { DcPrintActions } from "@/components/dc-print-actions";

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
    driver_name: dc.driver_name,
    authorized_by: dc.authorized_by,
    remarks: dc.remarks,
    customer,
    items: (items ?? []).map((i) => ({
      component: i.component,
      material: i.material,
      received_qty: i.received_qty,
      sent_qty: i.sent_qty,
      balance: i.balance,
      remarks: i.remarks,
    })),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      <div className="mx-auto flex max-w-4xl justify-end gap-2 p-4 print:hidden">
        <DcPrintActions dc={pdfData} />
      </div>

      <div className="mx-auto max-w-4xl pb-10 dc-print-sheet">
        <header className="mb-5 flex items-start justify-between rounded-t-2xl bg-[#10233f] px-6 py-5 text-white print:rounded-none">
          <div>
            <div className="text-xl font-bold tracking-wide">OVIYA ENGINEERS</div>
            <div className="mt-1 text-xs opacity-80">Delivery Challan Management</div>
          </div>
          <div className="text-right text-xs opacity-90">
            <p>DC ENTRY</p>
          </div>
        </header>

        <section className="mb-5 rounded-2xl border border-transparent bg-white p-5 shadow-sm print:rounded-none print:border-[#222] print:shadow-none">
          <h2 className="mb-4 text-lg font-bold text-[#172033]">Delivery Challan</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-gray-500">Our DC Number</p>
              <p>{dc.dc_number}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-gray-500">Date</p>
              <p>{format(new Date(dc.dc_date), "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-gray-500">Customer DC Number</p>
              <p>{dc.customer_dc_number ?? "-"}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-gray-500">Customer DC Date</p>
              <p>{dc.customer_dc_date ? format(new Date(dc.customer_dc_date), "dd MMM yyyy") : "-"}</p>
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
              {dc.driver_name && <p className="text-gray-600">Driver: {dc.driver_name}</p>}
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-transparent bg-white p-5 shadow-sm print:rounded-none print:border-[#222] print:shadow-none">
          <div className="mb-3 font-bold text-[#172033]">Material / Component Details</div>
          <div className="overflow-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">S.No.</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Component</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Material</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Received Qty</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Sent Qty</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Balance</th>
                  <th className="border border-[#d9dee7] bg-[#eef2f7] p-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border border-[#d9dee7] p-2">{idx + 1}</td>
                    <td className="border border-[#d9dee7] p-2">{item.component}</td>
                    <td className="border border-[#d9dee7] p-2">{item.material ?? ""}</td>
                    <td className="border border-[#d9dee7] p-2">{item.received_qty}</td>
                    <td className="border border-[#d9dee7] p-2">{item.sent_qty}</td>
                    <td className="border border-[#d9dee7] p-2">{item.balance}</td>
                    <td className="border border-[#d9dee7] p-2">{item.remarks ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {dc.remarks && (
          <section className="mb-5 rounded-2xl border border-transparent bg-white p-5 shadow-sm print:rounded-none print:border-[#222] print:shadow-none">
            <p className="mb-1 font-bold text-[#172033]">General Remarks</p>
            <p className="text-sm">{dc.remarks}</p>
          </section>
        )}

        <section className="rounded-2xl border border-transparent bg-white p-5 shadow-sm print:rounded-none print:border-[#222] print:shadow-none">
          <div className="mt-8 flex justify-between text-sm">
            <div className="w-2/5 border-t border-black pt-2 text-center">Receiver&apos;s Signature</div>
            <div className="w-2/5 border-t border-black pt-2 text-center">
              {dc.authorized_by || "Authorized Signatory"}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

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
    vehicle_number: dc.vehicle_number,
    driver_name: dc.driver_name,
    authorized_by: dc.authorized_by,
    remarks: dc.remarks,
    customer,
    items: (items ?? []).map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      remarks: i.remarks,
    })),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white text-black print:static print:overflow-visible">
      <div className="mx-auto flex max-w-3xl justify-end gap-2 p-4 print:hidden">
        <DcPrintActions dc={pdfData} />
      </div>

      <div className="mx-auto max-w-3xl bg-white p-8 print:p-0 dc-print-sheet">
        <div className="mb-6 flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-xl font-bold">Oviya Engineers</h1>
            <p className="text-sm text-gray-600">Precision Engineering &amp; Fabrication</p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="font-semibold">DC No:</span> {dc.dc_number}
            </p>
            <p>
              <span className="font-semibold">Date:</span>{" "}
              {format(new Date(dc.dc_date), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        <h2 className="mb-4 text-center text-lg font-bold tracking-wide">DELIVERY CHALLAN</h2>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold">Customer</p>
            <p>{customer?.name ?? "-"}</p>
            <p className="text-gray-600">{customer?.address ?? ""}</p>
            <p className="text-gray-600">{customer?.phone ?? ""}</p>
            {customer?.gst_number && <p className="text-gray-600">GST: {customer.gst_number}</p>}
          </div>
          <div>
            <p className="font-semibold">Transport</p>
            <p>Vehicle No: {dc.vehicle_number ?? "-"}</p>
            <p>Driver: {dc.driver_name ?? "-"}</p>
          </div>
        </div>

        <table className="mb-6 w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">Description</th>
              <th className="border border-gray-300 p-2 text-left">Qty</th>
              <th className="border border-gray-300 p-2 text-left">Unit</th>
              <th className="border border-gray-300 p-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="border border-gray-300 p-2">{item.description}</td>
                <td className="border border-gray-300 p-2">{item.quantity}</td>
                <td className="border border-gray-300 p-2">{item.unit}</td>
                <td className="border border-gray-300 p-2">{item.remarks ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {dc.remarks && (
          <div className="mb-6 text-sm">
            <p className="font-semibold">Remarks</p>
            <p>{dc.remarks}</p>
          </div>
        )}

        <div className="mt-16 flex justify-between text-sm">
          <div className="w-2/5 border-t border-black pt-2 text-center">Receiver&apos;s Signature</div>
          <div className="w-2/5 border-t border-black pt-2 text-center">
            {dc.authorized_by || "Authorized Signatory"}
          </div>
        </div>
      </div>
    </div>
  );
}

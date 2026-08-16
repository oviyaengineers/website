import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { InvoicePrintActions } from "@/components/invoice-print-actions";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", invoice.customer_id).single(),
  ]);

  const pdfData = {
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    subtotal: Number(invoice.subtotal),
    gst_rate: Number(invoice.gst_rate),
    gst_amount: Number(invoice.gst_amount),
    discount: Number(invoice.discount),
    grand_total: Number(invoice.grand_total),
    notes: invoice.notes,
    customer,
    items: (items ?? []).map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unit_price: Number(i.unit_price),
      amount: Number(i.amount),
    })),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white text-black print:static print:overflow-visible">
      <div className="mx-auto flex max-w-3xl justify-end gap-2 p-4 print:hidden">
        <InvoicePrintActions invoice={pdfData} />
      </div>

      <div className="mx-auto max-w-3xl bg-white p-8 print:p-0 dc-print-sheet">
        <div className="mb-6 flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-xl font-bold">Oviya Engineers</h1>
            <p className="text-sm text-gray-600">Precision Engineering &amp; Fabrication</p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="font-semibold">Invoice No:</span> {invoice.invoice_number}
            </p>
            <p>
              <span className="font-semibold">Date:</span>{" "}
              {format(new Date(invoice.invoice_date), "dd MMM yyyy")}
            </p>
            {invoice.due_date && (
              <p>
                <span className="font-semibold">Due:</span>{" "}
                {format(new Date(invoice.due_date), "dd MMM yyyy")}
              </p>
            )}
          </div>
        </div>

        <h2 className="mb-4 text-center text-lg font-bold tracking-wide">TAX INVOICE</h2>

        <div className="mb-6 text-sm">
          <p className="font-semibold">Bill To</p>
          <p>{customer?.name ?? "-"}</p>
          <p className="text-gray-600">{customer?.address ?? ""}</p>
          <p className="text-gray-600">{customer?.phone ?? ""}</p>
          {customer?.gst_number && <p className="text-gray-600">GST: {customer.gst_number}</p>}
        </div>

        <table className="mb-6 w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">Description</th>
              <th className="border border-gray-300 p-2 text-left">Qty</th>
              <th className="border border-gray-300 p-2 text-left">Unit</th>
              <th className="border border-gray-300 p-2 text-right">Unit Price</th>
              <th className="border border-gray-300 p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="border border-gray-300 p-2">{item.description}</td>
                <td className="border border-gray-300 p-2">{item.quantity}</td>
                <td className="border border-gray-300 p-2">{item.unit}</td>
                <td className="border border-gray-300 p-2 text-right">
                  {Number(item.unit_price).toFixed(2)}
                </td>
                <td className="border border-gray-300 p-2 text-right">
                  {Number(item.amount).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mb-6 w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>₹{Number(invoice.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>GST ({invoice.gst_rate}%)</span>
            <span>₹{Number(invoice.gst_amount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-₹{Number(invoice.discount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-black pt-1 font-semibold">
            <span>Grand Total</span>
            <span>₹{Number(invoice.grand_total).toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mb-6 text-sm">
            <p className="font-semibold">Notes</p>
            <p>{invoice.notes}</p>
          </div>
        )}

        <div className="mt-16 flex justify-between text-sm">
          <div className="w-2/5 border-t border-black pt-2 text-center">Customer Signature</div>
          <div className="w-2/5 border-t border-black pt-2 text-center">Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { PrintPreview } from "@/components/print/print-preview";
import { InvoiceDocument, type InvoiceDocumentData } from "@/components/invoice-document";
import { fetchInvoiceDetail } from "@/lib/billing-data";

/**
 * The customer-facing document, one A4 page: a TAX INVOICE when GST Bill is
 * ON, or a plain BILL when it is OFF, with no GSTIN, HSN/SAC or tax rows.
 *
 * Seller and buyer come from the snapshots taken when the invoice was issued,
 * so a reprint matches the original even after Settings or the customer change.
 * The same document is shown as the preview before issuing.
 */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, workLines, chargeLines, dcs } = detail;

  const data: InvoiceDocumentData = {
    gst: invoice.gst_bill,
    number: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    billingMonth: invoice.billing_month,
    placeOfSupply: invoice.place_of_supply,
    intra: invoice.tax_type !== "inter",
    seller: invoice.seller_snapshot,
    buyer: invoice.buyer_snapshot ?? {
      name: detail.customerName,
      address: null,
      state: null,
      gstin: null,
      phone: null,
      email: null,
    },
    lines: workLines.map((line) => ({
      key: line.id,
      description: line.description,
      material: line.material,
      hsn: line.hsn_sac,
      quantity: Number(line.quantity),
      rate: Number(line.unit_price),
      amount: Number(line.amount),
    })),
    charges: chargeLines.map((charge) => ({
      key: charge.id,
      description: charge.description,
      hsn: charge.hsn_sac,
      amount: Number(charge.amount),
    })),
    dcs: dcs.map((dc) => ({
      dcNumber: dc.dcNumber,
      dcDate: dc.dcDate,
      customerDcNumbers: dc.customerDcNumbers,
    })),
    totals: {
      subtotal: Number(invoice.subtotal),
      otherCharges: Number(invoice.other_charges),
      discount: Number(invoice.discount),
      taxable: Number(invoice.taxable_value),
      cgstRate: Number(invoice.cgst_rate),
      sgstRate: Number(invoice.sgst_rate),
      igstRate: Number(invoice.igst_rate),
      cgst: Number(invoice.cgst_amount),
      sgst: Number(invoice.sgst_amount),
      igst: Number(invoice.igst_amount),
      tax: Number(invoice.gst_amount),
      grandTotal: Number(invoice.grand_total),
    },
    notes: invoice.notes,
    watermark: invoice.status === "cancelled" ? "CANCELLED" : null,
  };

  return (
    // Billing screens are English only, whatever the ERP language.
    <PrintPreview
      back={{ href: `/dashboard/invoices/${invoice.id}`, label: "Close", close: true }}
      english
    >
      <div className="invoice-print-stage">
        <InvoiceDocument data={data} />
      </div>
    </PrintPreview>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintNowButton } from "@/components/print-now-button";
import { fetchInvoiceDetail } from "@/lib/billing-data";
import { amountInWords, formatBillingMonth, formatRupees } from "@/lib/billing";

const day = (value: string | null) =>
  value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "dd MMM yyyy") : "-";

const CELL = "border border-[#222] px-1.5 py-1";

/**
 * The customer-facing tax invoice, one A4 page.
 *
 * Seller and buyer come from the snapshots taken when the invoice was issued,
 * so a reprint matches the original even after Settings or the customer change.
 * Lines are the grouped invoice lines; the DCs they came from are listed once
 * below the table. No internal DC balance appears here.
 */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, workLines, chargeLines, dcs } = detail;
  const seller = invoice.seller_snapshot;
  const buyer = invoice.buyer_snapshot;
  const intra = invoice.tax_type !== "inter";
  const cancelled = invoice.status === "cancelled";

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-[#f4f6f9]/95 p-4 backdrop-blur print:hidden">
        <Button render={<Link href={`/dashboard/invoices/${invoice.id}`} />} variant="outline">
          <X className="h-4 w-4" /> Close
        </Button>
        <PrintNowButton label="Print invoice" />
      </div>

      <div className="invoice-print-stage">
        <div className="invoice-print-page">
          {cancelled ? <div className="invoice-cancelled-mark">CANCELLED</div> : null}

          <div className="border border-[#222]">
            <div className="border-b border-[#222] px-3 py-1 text-center text-base font-bold tracking-wide">
              TAX INVOICE
            </div>
            <div className="grid grid-cols-[1.4fr_1fr] text-[10.5px]">
              <div className="border-r border-[#222] p-2">
                <p className="text-sm font-bold">{seller?.legal_name ?? ""}</p>
                {seller?.address ? <p className="whitespace-pre-line">{seller.address}</p> : null}
                <p>State: {seller?.state ?? ""}</p>
                <p>GSTIN: {seller?.gstin ?? ""}</p>
                {seller?.phone || seller?.email ? (
                  <p>{[seller?.phone, seller?.email].filter(Boolean).join(" · ")}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-[auto_1fr] content-start gap-x-2 p-2">
                <span className="font-semibold">Invoice No.</span>
                <span className="font-bold">{invoice.invoice_number}</span>
                <span className="font-semibold">Invoice Date</span>
                <span>{day(invoice.invoice_date)}</span>
                <span className="font-semibold">Billing Month</span>
                <span>{formatBillingMonth(invoice.billing_month)}</span>
                <span className="font-semibold">Due Date</span>
                <span>{day(invoice.due_date)}</span>
                <span className="font-semibold">Place of Supply</span>
                <span>{invoice.place_of_supply ?? "-"}</span>
              </div>
            </div>
            <div className="border-t border-[#222] p-2 text-[10.5px]">
              <p className="font-semibold">Bill To</p>
              <p className="text-sm font-bold">{buyer?.name ?? detail.customerName}</p>
              {buyer?.address ? <p className="whitespace-pre-line">{buyer.address}</p> : null}
              <p>
                State: {buyer?.state ?? "-"} · GSTIN: {buyer?.gstin ?? "Unregistered"}
              </p>
            </div>
          </div>

          <table className="mt-2 w-full border-collapse text-[10px]">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "39%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
              <tr>
                {["S.No", "Description", "Material", "HSN/SAC", "Qty", "Rate", "Amount"].map(
                  (h) => (
                    <th key={h} className={`${CELL} text-center font-semibold`}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {workLines.map((line, index) => {
                return (
                  <tr key={line.id}>
                    <td className={`${CELL} text-center`}>{index + 1}</td>
                    <td className={CELL}>{line.description}</td>
                    <td className={`${CELL} text-center`}>{line.material ?? "-"}</td>
                    <td className={`${CELL} text-center`}>{line.hsn_sac ?? "-"}</td>
                    <td className={`${CELL} text-right`}>{Number(line.quantity)}</td>
                    <td className={`${CELL} text-right`}>
                      {formatRupees(Number(line.unit_price))}
                    </td>
                    <td className={`${CELL} text-right`}>{formatRupees(Number(line.amount))}</td>
                  </tr>
                );
              })}
              {chargeLines.map((charge, index) => {
                return (
                  <tr key={charge.id}>
                    <td className={`${CELL} text-center`}>{workLines.length + index + 1}</td>
                    <td className={CELL}>{charge.description}</td>
                    <td className={`${CELL} text-center`}>-</td>
                    <td className={`${CELL} text-center`}>{charge.hsn_sac ?? "-"}</td>
                    <td className={`${CELL} text-right`}>-</td>
                    <td className={`${CELL} text-right`}>-</td>
                    <td className={`${CELL} text-right`}>{formatRupees(Number(charge.amount))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {dcs.length > 0 ? (
            <div className="mt-2 border border-[#222] px-2 py-1 text-[9px] leading-snug">
              <span className="font-semibold">
                DCs covered, {formatBillingMonth(invoice.billing_month)} (our DC, date, your
                DC):{" "}
              </span>
              {dcs
                .map((dc) =>
                  [
                    dc.dcNumber,
                    dc.dcDate ? format(new Date(`${dc.dcDate}T00:00:00`), "dd MMM") : null,
                    dc.customerDcNumbers.join(", ") || null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                )
                .join("; ")}
            </div>
          ) : null}

          <div className="mt-2 grid grid-cols-[1.3fr_1fr] gap-2 text-[10.5px]">
            <div className="space-y-2">
              <div className="border border-[#222] p-2">
                <p className="font-semibold">Amount in words</p>
                <p>{amountInWords(Number(invoice.grand_total))}</p>
              </div>
              <div className="border border-[#222] p-2">
                <p className="font-semibold">Bank details</p>
                <p>Bank: {seller?.bank_name ?? "-"}</p>
                <p>Account name: {seller?.bank_account_name ?? "-"}</p>
                <p>Account no.: {seller?.bank_account_number ?? "-"}</p>
                <p>
                  IFSC: {seller?.bank_ifsc ?? "-"}
                  {seller?.bank_branch ? ` · Branch: ${seller.bank_branch}` : ""}
                </p>
              </div>
              {seller?.payment_terms || invoice.notes ? (
                <div className="border border-[#222] p-2">
                  <p className="font-semibold">Payment / terms</p>
                  {seller?.payment_terms ? (
                    <p className="whitespace-pre-line">{seller.payment_terms}</p>
                  ) : null}
                  {invoice.notes ? <p className="whitespace-pre-line">{invoice.notes}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <table className="w-full border-collapse">
                <tbody>
                  {[
                    ["Subtotal", Number(invoice.subtotal)],
                    ["Other charges (included above)", Number(invoice.other_charges)],
                    ["Discount", -Number(invoice.discount)],
                    ["Taxable value", Number(invoice.taxable_value)],
                    ...(intra
                      ? [
                          [`CGST @ ${Number(invoice.cgst_rate)}%`, Number(invoice.cgst_amount)],
                          [`SGST @ ${Number(invoice.sgst_rate)}%`, Number(invoice.sgst_amount)],
                        ]
                      : [[`IGST @ ${Number(invoice.igst_rate)}%`, Number(invoice.igst_amount)]]),
                  ].map(([label, value]) => (
                    <tr key={label as string}>
                      <td className={CELL}>{label}</td>
                      <td className={`${CELL} text-right`}>{formatRupees(value as number)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${CELL} text-sm font-bold`}>Grand Total (₹)</td>
                    <td className={`${CELL} text-right text-sm font-bold`}>
                      {formatRupees(Number(invoice.grand_total))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="flex h-24 flex-col justify-between border border-[#222] p-2 text-center">
                <p className="font-semibold">For {seller?.legal_name ?? ""}</p>
                <div>
                  {seller?.authorized_signatory ? <p>{seller.authorized_signatory}</p> : null}
                  <p className="font-semibold">Authorized Signatory</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

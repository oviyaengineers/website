import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/components/status-badge";
import { BillTypeBadge, InvoiceStatusBadge } from "@/components/billing-badges";
import { InvoiceCancelButton } from "@/components/invoice-cancel-button";
import { InvoicePaymentForm } from "@/components/invoice-payment-form";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { fetchInvoiceDetail } from "@/lib/billing-data";
import { amountInWords, formatBillingMonth, formatRupees } from "@/lib/billing";

export const metadata: Metadata = { title: "Invoice | Oviya Engineers" };

const day = (value: string | null) =>
  value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "dd MMM yyyy") : "-";

/**
 * One invoice as issued: seller and buyer as they were on the day, the DC
 * lines it bills (each linked back), other charges, tax and payment.
 */
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, { profile }] = await Promise.all([
    fetchInvoiceDetail(id),
    getCurrentUserAndProfile(),
  ]);
  if (!detail) notFound();
  const { invoice, workLines, chargeLines, dcs } = detail;
  const isAdmin = profile?.role === "admin";
  const buyer = invoice.buyer_snapshot;
  const seller = invoice.seller_snapshot;
  const cancelled = invoice.status === "cancelled";
  const gst = invoice.gst_bill;
  const work = workLines.reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={invoice.invoice_number} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            {formatBillingMonth(invoice.billing_month)} · {day(invoice.invoice_date)} ·{" "}
            {detail.customerName}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BillTypeBadge gstBill={gst} />
          <InvoiceStatusBadge status={invoice.status} />
          {!cancelled ? <PaymentStatusBadge status={invoice.payment_status} /> : null}
          <Button
            render={<Link href={`/dashboard/invoices/${invoice.id}/print`} />}
            variant="outline"
            className="h-11 sm:h-8"
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          {isAdmin && !cancelled ? (
            <InvoiceCancelButton invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
          ) : null}
        </div>
      </div>

      {cancelled ? (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Cancelled {day(invoice.cancelled_at)}</p>
          <p className="text-muted-foreground">Reason: {invoice.cancel_reason ?? "-"}</p>
          <p className="text-muted-foreground">
            Its number stays reserved and its DC quantity no longer counts as billed.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill to</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{buyer?.name ?? detail.customerName}</p>
            {buyer?.address ? (
              <p className="whitespace-pre-line text-muted-foreground">{buyer.address}</p>
            ) : null}
            <p className="text-muted-foreground">State: {buyer?.state ?? "-"}</p>
            {gst ? <p className="text-muted-foreground">GSTIN: {buyer?.gstin ?? "-"}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {gst ? "GST tax invoice" : "Normal bill (no GST)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Billing month: {formatBillingMonth(invoice.billing_month)}</p>
            <p>
              {gst ? "Invoice" : "Bill"} date: {day(invoice.invoice_date)}
            </p>
            <p>Due date: {day(invoice.due_date)}</p>
            {gst ? (
              <>
                <p>
                  Tax:{" "}
                  {invoice.tax_type === "inter"
                    ? "IGST (inter-state)"
                    : "CGST + SGST (intra-state)"}
                </p>
                <p>Place of supply: {invoice.place_of_supply ?? "-"}</p>
                <p className="text-muted-foreground">Seller GSTIN: {seller?.gstin ?? "-"}</p>
              </>
            ) : (
              <p className="text-muted-foreground">
                GST Bill OFF: no CGST, SGST or IGST. To make it a GST invoice, cancel it and create
                a new one.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DCs covered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {dcs.length === 0 ? <p className="text-muted-foreground">Other charges only.</p> : null}
            {dcs.map((dc) => (
              <p key={dc.id}>
                <Link href={`/dashboard/dc/${dc.id}`} className="font-medium hover:underline">
                  {dc.dcNumber}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {day(dc.dcDate)} · customer DC {dc.customerDcNumbers.join(", ") || "-"}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billed DC work</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each invoice line groups the same component, material, rate and HSN/SAC. Open a line to
            see exactly which DC lines it bills.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">#</th>
                <th className="px-3 py-2.5 text-left font-medium">Component / Material</th>
                <th className="px-3 py-2.5 text-left font-medium">HSN/SAC</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {workLines.map((line, index) => (
                <Fragment key={line.id}>
                  <tr className="border-t align-top">
                    <td className="px-3 pt-2.5">{index + 1}</td>
                    <td className="px-3 pt-2.5">
                      {line.description}
                      <span className="block text-xs text-muted-foreground">
                        {line.material ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 pt-2.5">{line.hsn_sac ?? "-"}</td>
                    <td className="px-3 pt-2.5 text-right tabular-nums">{Number(line.quantity)}</td>
                    <td className="px-3 pt-2.5 text-right tabular-nums">
                      {formatRupees(Number(line.unit_price))}
                      {line.list_rate !== null &&
                      Number(line.list_rate) !== Number(line.unit_price) ? (
                        <span className="block text-xs text-muted-foreground">
                          list {formatRupees(Number(line.list_rate))}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 pt-2.5 text-right tabular-nums">
                      {formatRupees(Number(line.amount))}
                    </td>
                  </tr>
                  <tr>
                    <td />
                    <td colSpan={5} className="px-3 pt-1 pb-2.5">
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          From {line.sources.length} DC line{line.sources.length === 1 ? "" : "s"}:{" "}
                          {[...new Set(line.sources.map((s) => s.dcNumber))].join(", ")}
                        </summary>
                        <div className="mt-2 overflow-x-auto rounded-md border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="px-2 py-1.5 text-left font-medium">Our DC</th>
                                <th className="px-2 py-1.5 text-left font-medium">Customer DC</th>
                                <th className="px-2 py-1.5 text-left font-medium">DC date</th>
                                <th className="px-2 py-1.5 text-left font-medium">Component</th>
                                <th className="px-2 py-1.5 text-left font-medium">Material</th>
                                <th className="px-2 py-1.5 text-right font-medium">Sent</th>
                                <th className="px-2 py-1.5 text-right font-medium">Billed here</th>
                              </tr>
                            </thead>
                            <tbody>
                              {line.sources.map((source) => (
                                <tr key={source.sourceId} className="border-b last:border-b-0">
                                  <td className="px-2 py-1.5 whitespace-nowrap">
                                    {source.dcId ? (
                                      <Link
                                        href={`/dashboard/dc/${source.dcId}`}
                                        className="font-medium hover:underline"
                                      >
                                        {source.dcNumber}
                                      </Link>
                                    ) : (
                                      source.dcNumber
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {source.customerDcNumbers.join(", ") || "-"}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">
                                    {day(source.dcDate)}
                                  </td>
                                  <td className="px-2 py-1.5">{source.component}</td>
                                  <td className="px-2 py-1.5">{source.material ?? "-"}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {source.sent}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                                    {source.quantity}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {workLines.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No DC work on this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {chargeLines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other charges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {chargeLines.map((charge) => (
              <p key={charge.id} className="flex justify-between gap-4">
                <span>
                  {charge.description}
                  {charge.hsn_sac ? (
                    <span className="text-muted-foreground"> · {charge.hsn_sac}</span>
                  ) : null}
                </span>
                <span className="tabular-nums">₹{formatRupees(Number(charge.amount))}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Paid ₹{formatRupees(Number(invoice.amount_paid))} of ₹
              {formatRupees(Number(invoice.grand_total))}
            </p>
            {!cancelled ? (
              <InvoicePaymentForm
                invoiceId={invoice.id}
                status={invoice.payment_status}
                amountPaid={Number(invoice.amount_paid)}
                grandTotal={Number(invoice.grand_total)}
              />
            ) : (
              <p className="text-muted-foreground">A cancelled invoice takes no payments.</p>
            )}
            {invoice.notes ? <p className="text-muted-foreground">Notes: {invoice.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            {[
              ["DC work", work],
              ["Other charges", Number(invoice.other_charges)],
              ["Subtotal", Number(invoice.subtotal)],
              ["Discount", -Number(invoice.discount)],
              ...(gst
                ? [
                    ["Taxable value", Number(invoice.taxable_value)],
                    ...(invoice.tax_type === "inter"
                      ? [[`IGST ${Number(invoice.igst_rate)}%`, Number(invoice.igst_amount)]]
                      : [
                          [`CGST ${Number(invoice.cgst_rate)}%`, Number(invoice.cgst_amount)],
                          [`SGST ${Number(invoice.sgst_rate)}%`, Number(invoice.sgst_amount)],
                        ]),
                    ["Total tax", Number(invoice.gst_amount)],
                  ]
                : []),
            ].map(([label, value]) => (
              <p key={label as string} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">₹{formatRupees(value as number)}</span>
              </p>
            ))}
            <p className="flex justify-between gap-4 border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span className="tabular-nums">₹{formatRupees(Number(invoice.grand_total))}</span>
            </p>
            <p className="pt-2 text-xs text-muted-foreground">
              {amountInWords(Number(invoice.grand_total))}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

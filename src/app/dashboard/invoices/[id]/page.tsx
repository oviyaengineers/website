import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/status-badge";
import { PaymentStatusForm } from "@/components/payment-status-form";
import { DeleteInvoiceButton } from "@/components/delete-invoice-button";
import { Pencil, Printer } from "lucide-react";

export const metadata: Metadata = { title: "Invoice | Oviya Engineers" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();

  const [{ data: items }, { data: customer }, dcResult] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", invoice.customer_id).single(),
    invoice.dc_id
      ? supabase.from("delivery_challans").select("dc_number").eq("id", invoice.dc_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(invoice.invoice_date), "dd MMM yyyy")}
            {dcResult?.data && ` · Linked to ${dcResult.data.dc_number}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PaymentStatusBadge status={invoice.payment_status} />
          <Button render={<Link href={`/dashboard/invoices/${id}/print`} />} variant="outline">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button render={<Link href={`/dashboard/invoices/${id}/edit`} />} variant="outline">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {isAdmin && <DeleteInvoiceButton id={invoice.id} invoiceNumber={invoice.invoice_number} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{customer?.name ?? "-"}</p>
          <p className="text-muted-foreground">{customer?.address ?? "-"}</p>
          <p className="text-muted-foreground">{customer?.phone ?? "-"}</p>
          {customer?.gst_number && <p className="text-muted-foreground">GST: {customer.gst_number}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>₹{Number(item.unit_price).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    ₹{Number(item.amount).toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="max-w-sm ml-auto">
        <CardContent className="space-y-1 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>₹{Number(invoice.subtotal).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST ({invoice.gst_rate}%)</span>
            <span>₹{Number(invoice.gst_amount).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>-₹{Number(invoice.discount).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Grand Total</span>
            <span>₹{Number(invoice.grand_total).toLocaleString("en-IN")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentStatusForm
            id={invoice.id}
            status={invoice.payment_status}
            amountPaid={Number(invoice.amount_paid)}
            grandTotal={Number(invoice.grand_total)}
          />
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{invoice.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

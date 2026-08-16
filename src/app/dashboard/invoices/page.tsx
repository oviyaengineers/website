import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Printer } from "lucide-react";
import { PaymentStatusBadge } from "@/components/status-badge";
import { DeleteInvoiceButton } from "@/components/delete-invoice-button";
import type { PaymentStatus } from "@/types/database";

export const metadata: Metadata = { title: "Invoices | Oviya Engineers" };

export default async function InvoicesListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  let query = supabase.from("invoices").select("*").order("invoice_date", { ascending: false });
  if (status) query = query.eq("payment_status", status as PaymentStatus);

  const [{ data }, { data: customersData }] = await Promise.all([
    query,
    supabase.from("customers").select("id, name"),
  ]);
  const customerMap = new Map((customersData ?? []).map((c) => [c.id, c.name]));
  let invoices = (data ?? []).map((inv) => ({
    ...inv,
    customerName: customerMap.get(inv.customer_id) ?? null,
  }));

  if (q) {
    const needle = q.toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(needle) ||
        (inv.customerName ?? "").toLowerCase().includes(needle)
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">{invoices.length} record(s)</p>
        </div>
        <Button render={<Link href="/dashboard/invoices/new" />}>
          <Plus /> New Invoice
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <form className="max-w-sm flex-1" action="/dashboard/invoices">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search invoice # or customer..."
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          />
        </form>
        <form action="/dashboard/invoices">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </form>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Grand Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{format(new Date(inv.invoice_date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{inv.customerName ?? "-"}</TableCell>
                  <TableCell>₹{Number(inv.grand_total).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={inv.payment_status} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      render={<Link href={`/dashboard/invoices/${inv.id}`} />}
                      variant="outline"
                      size="sm"
                    >
                      View
                    </Button>
                    <Button
                      render={<Link href={`/dashboard/invoices/${inv.id}/print`} />}
                      variant="outline"
                      size="sm"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    {isAdmin && <DeleteInvoiceButton id={inv.id} invoiceNumber={inv.invoice_number} />}
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:hidden">
        {invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-start justify-between">
                <span className="font-medium">{inv.invoice_number}</span>
                <PaymentStatusBadge status={inv.payment_status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {format(new Date(inv.invoice_date), "dd MMM yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">{inv.customerName ?? "-"}</p>
              <p className="text-sm font-medium">
                ₹{Number(inv.grand_total).toLocaleString("en-IN")}
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  render={<Link href={`/dashboard/invoices/${inv.id}`} />}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  View
                </Button>
                <Button
                  render={<Link href={`/dashboard/invoices/${inv.id}/print`} />}
                  variant="outline"
                  size="sm"
                >
                  <Printer className="h-4 w-4" />
                </Button>
                {isAdmin && <DeleteInvoiceButton id={inv.id} invoiceNumber={inv.invoice_number} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {invoices.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No invoices found.</p>
        )}
      </div>
    </div>
  );
}

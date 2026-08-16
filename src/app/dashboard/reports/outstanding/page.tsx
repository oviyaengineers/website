import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { redirect } from "next/navigation";
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

export const metadata: Metadata = { title: "Outstanding Payments | Oviya Engineers" };

export default async function OutstandingReportPage() {
  const { profile } = await getCurrentUserAndProfile();
  if (profile?.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: invoices }, { data: customersData }] = await Promise.all([
    supabase.from("invoices").select("*").neq("payment_status", "paid").order("due_date"),
    supabase.from("customers").select("id, name"),
  ]);
  const customerMap = new Map((customersData ?? []).map((c) => [c.id, c.name]));

  const rows = (invoices ?? []).map((inv) => ({
    ...inv,
    customerName: customerMap.get(inv.customer_id) ?? "-",
    balance: Number(inv.grand_total) - Number(inv.amount_paid),
    overdue: inv.due_date ? new Date(inv.due_date) < new Date() : false,
  }));

  const totalOutstanding = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Outstanding Payments</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} unpaid/partial invoice(s)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total Outstanding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            ₹{totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Grand Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.invoice_number}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell className={r.overdue ? "text-destructive font-medium" : ""}>
                    {r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "-"}
                    {r.overdue && " (overdue)"}
                  </TableCell>
                  <TableCell>₹{Number(r.grand_total).toLocaleString("en-IN")}</TableCell>
                  <TableCell>₹{Number(r.amount_paid).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="font-medium">₹{r.balance.toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={r.payment_status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button render={<Link href={`/dashboard/invoices/${r.id}`} />} variant="outline" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No outstanding payments. Everything is settled.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

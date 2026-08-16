import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueCostChart } from "@/components/revenue-cost-chart";
import { Truck, Receipt, Users, AlertCircle } from "lucide-react";
import type { InvoiceRow, JobCostRow } from "@/types/database";

export default async function DashboardHomePage() {
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);

  const [{ count: dcThisMonth }, { count: customerCount }, { data: outstandingInvoices }] =
    await Promise.all([
      supabase
        .from("delivery_challans")
        .select("*", { count: "exact", head: true })
        .gte("dc_date", startOfMonthIso),
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase
        .from("invoices")
        .select("grand_total, amount_paid, payment_status")
        .neq("payment_status", "paid") as unknown as Promise<{
        data: Pick<InvoiceRow, "grand_total" | "amount_paid" | "payment_status">[] | null;
      }>,
    ]);

  const outstandingTotal = (outstandingInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.grand_total) - Number(inv.amount_paid)),
    0
  );

  let revenueVsCost: { month: string; revenue: number; cost: number }[] = [];
  if (isAdmin) {
    const { data: invoices } = (await supabase
      .from("invoices")
      .select("grand_total, invoice_date")) as unknown as {
      data: Pick<InvoiceRow, "grand_total" | "invoice_date">[] | null;
    };
    const { data: jobCosts } = (await supabase
      .from("job_costs")
      .select("total_cost, created_at")) as unknown as {
      data: Pick<JobCostRow, "total_cost" | "created_at">[] | null;
    };
    const monthMap = new Map<string, { revenue: number; cost: number }>();
    for (const inv of invoices ?? []) {
      const key = String(inv.invoice_date).slice(0, 7);
      const entry = monthMap.get(key) ?? { revenue: 0, cost: 0 };
      entry.revenue += Number(inv.grand_total);
      monthMap.set(key, entry);
    }
    for (const jc of jobCosts ?? []) {
      const key = String(jc.created_at).slice(0, 7);
      const entry = monthMap.get(key) ?? { revenue: 0, cost: 0 };
      entry.cost += Number(jc.total_cost);
      monthMap.set(key, entry);
    }
    revenueVsCost = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({ month, ...v }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">DCs this month</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dcThisMonth ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customerCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Invoices</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{outstandingTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {(outstandingInvoices ?? []).length} unpaid/partial invoice(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" /> Revenue vs Cost (last 6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueCostChart data={revenueVsCost} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueCostChart } from "@/components/revenue-cost-chart";
import { Truck, Receipt, Users, AlertCircle } from "lucide-react";
import { SearchBox } from "@/components/search-box";
import { GlobalSearchResults } from "@/components/global-search-results";
import { globalSearch } from "@/lib/global-search";
import { getTranslator } from "@/lib/i18n/server";
import Link from "next/link";
import { isModuleUnlocked } from "@/lib/module-lock-server";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q ?? "";
  const { t } = await getTranslator();
  // Searching replaces the dashboard's figures with results, because when
  // somebody is looking for a record the month's totals are not the answer.
  const hits = term.trim().length >= 2 ? await globalSearch(term, t) : [];
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";
  // Billing figures come from behind the PIN. While it is locked the database
  // returns none, and a zero here would read as a real figure.
  const billingUnlocked = await isModuleUnlocked("billing");
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
        .eq("status", "issued")
        .neq("payment_status", "paid"),
    ]);

  const outstandingTotal = (outstandingInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.grand_total) - Number(inv.amount_paid)),
    0
  );

  let revenueVsCost: { month: string; revenue: number; cost: number }[] = [];
  if (isAdmin) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("grand_total, invoice_date")
      .eq("status", "issued");
    const { data: jobCosts } = await supabase.from("job_costs").select("total_cost, created_at");
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
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.full_name
            ? t("dashboard.welcomeName", { name: profile.full_name })
            : t("dashboard.welcome")}
        </p>
      </div>

      <SearchBox placeholder={t("dashboard.searchPlaceholder")} className="w-full sm:w-[32rem]" />

      {term.trim() ? (
        <GlobalSearchResults term={term} hits={hits} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("dashboard.dcsThisMonth")}</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dcThisMonth ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("dashboard.totalCustomers")}
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customerCount ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("dashboard.outstandingInvoices")}
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {billingUnlocked ? (
                  <>
                    <div className="text-2xl font-bold">
                      ₹{outstandingTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.unpaidInvoices", { count: (outstandingInvoices ?? []).length })}
                    </p>
                  </>
                ) : (
                  <BillingLockedNote
                    label={t("security.billingLockedNote")}
                    action={t("security.unlockBilling")}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" /> {t("dashboard.revenueVsCost")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {billingUnlocked ? (
                  <RevenueCostChart data={revenueVsCost} />
                ) : (
                  <BillingLockedNote
                    label={t("security.billingLockedNote")}
                    action={t("security.unlockBilling")}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function BillingLockedNote({ label, action }: { label: string; action: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Link
        href="/dashboard/unlock/billing?next=%2Fdashboard%2Finvoices"
        prefetch={false}
        className="text-sm font-medium text-[#10233f] underline-offset-2 hover:underline dark:text-sky-300"
      >
        {action}
      </Link>
    </div>
  );
}

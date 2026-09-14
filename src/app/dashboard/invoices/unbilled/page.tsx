import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { format } from "date-fns";
import { FilePlus2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BillingStatusBadge } from "@/components/billing-badges";
import { fetchBillableLines, type BillableFilters } from "@/lib/billing-data";
import { formatBillingMonth, parseMonthInput } from "@/lib/billing";
import { shortCustomerName } from "@/lib/customer-name";

export const metadata: Metadata = { title: "Unbilled Work | Oviya Engineers" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every DC line with Sent quantity, and how much of it is billed.
 *
 * Read from the DC lines themselves through dc_line_billing: billed is what
 * issued invoices hold, so this list cannot disagree with the invoices.
 */
export default async function UnbilledWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, { data: picklist }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
  ]);
  const t = (v?: string) => v?.trim() || undefined;
  const customer = (customers ?? []).find((c) => c.name === params.customer);
  const status = t(params.status) ?? "open";
  const filters: BillableFilters = {
    customerId: customer?.id,
    billingMonth: parseMonthInput(params.month) ?? undefined,
    q: t(params.q),
    from: DATE.test(params.from ?? "") ? params.from : undefined,
    to: DATE.test(params.to ?? "") ? params.to : undefined,
    component: t(params.component),
    material: t(params.material),
    status: status === "open" || status === "all" ? undefined : status,
  };
  const all = await fetchBillableLines(filters);
  const lines = status === "open" ? all.filter((l) => l.unbilled > 0) : all;
  const totals = lines.reduce(
    (sum, l) => ({
      sent: sum.sent + l.sent,
      billed: sum.billed + l.billed,
      unbilled: sum.unbilled + l.unbilled,
    }),
    { sent: 0, billed: 0, unbilled: 0 }
  );
  const components = (picklist ?? []).filter((p) => p.kind === "component").map((p) => p.name);
  const materials = (picklist ?? []).filter((p) => p.kind === "material").map((p) => p.name);
  const selectClass =
    "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9";
  const formKey = new URLSearchParams(
    Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]
  ).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Unbilled Work</h1>
          <p className="text-sm text-muted-foreground">
            Sent quantity on issued DCs, billed and unbilled. {lines.length} line
            {lines.length === 1 ? "" : "s"}: sent {totals.sent}, billed {totals.billed}, unbilled{" "}
            {totals.unbilled}.
          </p>
        </div>
        <Button render={<Link href="/dashboard/invoices/new" />} className="h-11 sm:h-8">
          <FilePlus2 className="h-4 w-4" /> New invoice
        </Button>
      </div>

      <Form
        key={formKey}
        action="/dashboard/invoices/unbilled"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor="ub-q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="ub-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Our DC, customer DC, customer, component, material"
            className="h-11 sm:h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ub-month" className="text-xs text-muted-foreground">
            Billing month
          </label>
          <Input
            id="ub-month"
            type="month"
            name="month"
            defaultValue={filters.billingMonth?.slice(0, 7)}
            className="h-11 w-44 sm:h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From (DC date)</label>
          <Input type="date" name="from" defaultValue={filters.from} className="h-11 w-40 sm:h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" name="to" defaultValue={filters.to} className="h-11 w-40 sm:h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <select
            name="customer"
            defaultValue={params.customer ?? ""}
            className={`${selectClass} w-52`}
          >
            <option value="">All customers</option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Component</label>
          <select
            name="component"
            defaultValue={filters.component ?? ""}
            className={`${selectClass} w-56`}
          >
            <option value="">All components</option>
            {components.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Material</label>
          <select
            name="material"
            defaultValue={filters.material ?? ""}
            className={`${selectClass} w-36`}
          >
            <option value="">All</option>
            {materials.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Billing status</label>
          <select name="status" defaultValue={status} className={`${selectClass} w-44`}>
            <option value="open">Unbilled + Partial</option>
            <option value="unbilled">Unbilled</option>
            <option value="partial">Partially Billed</option>
            <option value="billed">Billed</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11 sm:h-9">
            Apply
          </Button>
          <Button
            render={<Link href="/dashboard/invoices/unbilled" />}
            variant="outline"
            className="h-11 sm:h-9"
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        </div>
      </Form>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">Our DC / Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Month</th>
                <th className="px-3 py-2.5 text-left font-medium">Customer DC</th>
                <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                <th className="px-3 py-2.5 text-left font-medium">Component / Material</th>
                <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                <th className="px-3 py-2.5 text-right font-medium">Billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Unbilled</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Bill</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.dcItemId} className="border-b align-top last:border-b-0">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link
                      href={`/dashboard/dc/${line.dcId}`}
                      className="font-medium hover:underline"
                    >
                      {line.dcNumber}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {format(new Date(`${line.dcDate}T00:00:00`), "dd MMM yyyy")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatBillingMonth(line.billingMonth)}
                  </td>
                  <td className="px-3 py-2.5">{line.customerDcNumbers.join(", ") || "-"}</td>
                  <td className="px-3 py-2.5" title={line.customerName}>
                    {shortCustomerName(line.customerName)}
                  </td>
                  <td className="min-w-[200px] px-3 py-2.5">
                    {line.component}
                    <span className="block text-xs text-muted-foreground">
                      {line.material ?? "-"}
                      {line.followUpOf ? ` · follow-up of ${line.followUpOf}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.sent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.billed}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    {line.unbilled}
                  </td>
                  <td className="px-3 py-2.5">
                    <BillingStatusBadge status={line.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {line.unbilled > 0 ? (
                      <Button
                        render={
                          <Link
                            href={`/dashboard/invoices/new?customer=${line.customerId}&month=${line.billingMonth.slice(0, 7)}&dc=${line.dcId}`}
                          />
                        }
                        variant="outline"
                        size="sm"
                      >
                        Bill
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

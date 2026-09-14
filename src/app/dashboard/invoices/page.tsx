import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { format } from "date-fns";
import { ClipboardList, Plus, Printer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaymentStatusBadge } from "@/components/status-badge";
import { InvoiceStatusBadge, MonthStatusBadge } from "@/components/billing-badges";
import { fetchInvoiceList, fetchMonthSummaries, type InvoiceFilters } from "@/lib/billing-data";
import { formatBillingMonth, formatRupees, parseMonthInput } from "@/lib/billing";
import { shortCustomerName } from "@/lib/customer-name";

export const metadata: Metadata = { title: "Billing | Oviya Engineers" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(params: Record<string, string | undefined>): InvoiceFilters {
  const t = (v?: string) => v?.trim() || undefined;
  return {
    q: t(params.q),
    from: DATE.test(params.from ?? "") ? params.from : undefined,
    to: DATE.test(params.to ?? "") ? params.to : undefined,
    billingMonth: parseMonthInput(params.month) ?? undefined,
    customer: t(params.customer),
    component: t(params.component),
    material: t(params.material),
    status: t(params.status),
    payment: t(params.payment),
  };
}

/**
 * Billing by customer and month, then the invoices themselves, newest first,
 * searchable by invoice, DC, customer DC, customer, component, material and
 * status. A month can hold any number of invoices. Every filter lives in the URL.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = clean(await searchParams);
  const supabase = await createClient();
  const [invoices, { data: customers }, { data: picklist }, allMonths] = await Promise.all([
    fetchInvoiceList(filters),
    supabase.from("customers").select("name").order("name"),
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
    fetchMonthSummaries({ billingMonth: filters.billingMonth }),
  ]);
  const months = allMonths.filter(
    (m) =>
      (!filters.customer || m.customerName === filters.customer) &&
      (m.sent > 0 || m.issuedInvoices > 0 || m.cancelledInvoices > 0)
  );
  const components = (picklist ?? []).filter((p) => p.kind === "component").map((p) => p.name);
  const materials = (picklist ?? []).filter((p) => p.kind === "material").map((p) => p.name);
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][]
  ).toString();
  const selectClass =
    "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            {query ? " match these filters" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 [&>*]:h-11 sm:[&>*]:h-8">
          <Button render={<Link href="/dashboard/invoices/unbilled" />} variant="outline">
            <ClipboardList className="h-4 w-4" /> Unbilled work
          </Button>
          <Button render={<Link href="/dashboard/invoices/new" />}>
            <Plus className="h-4 w-4" /> New invoice
          </Button>
        </div>
      </div>

      <Form key={query} action="/dashboard/invoices" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor="inv-q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="inv-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Invoice no., our DC, customer DC, customer, component, material"
            className="h-11 sm:h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inv-month" className="text-xs text-muted-foreground">
            Billing month
          </label>
          <Input
            id="inv-month"
            type="month"
            name="month"
            defaultValue={filters.billingMonth?.slice(0, 7)}
            className="h-11 w-44 sm:h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Invoice date from</label>
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
            defaultValue={filters.customer ?? ""}
            className={`${selectClass} w-52`}
          >
            <option value="">All customers</option>
            {(customers ?? []).map((c) => (
              <option key={c.name} value={c.name}>
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
          <label className="text-xs text-muted-foreground">Invoice status</label>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={`${selectClass} w-36`}
          >
            <option value="">All</option>
            <option value="issued">Issued</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Payment</label>
          <select
            name="payment"
            defaultValue={filters.payment ?? ""}
            className={`${selectClass} w-32`}
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11 sm:h-9">
            Apply
          </Button>
          <Button
            render={<Link href="/dashboard/invoices" />}
            variant="outline"
            className="h-11 sm:h-9"
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        </div>
      </Form>

      <Card>
        <CardContent className="space-y-2 p-0">
          <div className="px-4 pt-4">
            <h2 className="font-medium text-[#10233f]">Monthly billing</h2>
            <p className="text-xs text-muted-foreground">
              Sent quantity on issued DCs per customer and month, how much of it issued invoices
              bill, and the invoices raised. Cancelled invoices are counted but bill nothing.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-y text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Month</th>
                  <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-3 py-2.5 text-right font-medium">Billed</th>
                  <th className="px-3 py-2.5 text-right font-medium">Unbilled</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Invoices</th>
                  <th className="px-3 py-2.5 text-right font-medium">Invoiced</th>
                  <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr
                    key={`${m.customerId}|${m.billingMonth}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatBillingMonth(m.billingMonth)}
                    </td>
                    <td className="px-3 py-2.5" title={m.customerName}>
                      {shortCustomerName(m.customerName)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.sent}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.billed}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {m.unbilled}
                    </td>
                    <td className="px-3 py-2.5">
                      <MonthStatusBadge status={m.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {m.issuedInvoices}
                      {m.cancelledInvoices > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          + {m.cancelledInvoices} cancelled
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      ₹{formatRupees(m.issuedTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      ₹{formatRupees(m.paidTotal)}
                    </td>
                    <td className="space-x-2 px-3 py-2.5 text-right whitespace-nowrap">
                      {m.issuedInvoices + m.cancelledInvoices > 0 ? (
                        <Button
                          render={
                            <Link
                              href={`/dashboard/invoices?customer=${encodeURIComponent(m.customerName)}&month=${m.billingMonth.slice(0, 7)}`}
                            />
                          }
                          variant="outline"
                          size="sm"
                        >
                          Invoices
                        </Button>
                      ) : null}
                      {m.unbilled > 0 ? (
                        <Button
                          render={
                            <Link
                              href={`/dashboard/invoices/new?customer=${m.customerId}&month=${m.billingMonth.slice(0, 7)}`}
                            />
                          }
                          size="sm"
                        >
                          New invoice
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {months.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      No billable work for these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">Invoice No.</th>
                <th className="px-3 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Billing month</th>
                <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                <th className="px-3 py-2.5 text-left font-medium">Our DCs / Customer DCs</th>
                <th className="px-3 py-2.5 text-right font-medium">Grand total</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-left font-medium">Payment</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={`border-b align-top last:border-b-0 ${inv.status === "cancelled" ? "text-muted-foreground" : ""}`}
                >
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {inv.invoice_number}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {format(new Date(`${inv.invoice_date}T00:00:00`), "dd MMM yyyy")}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatBillingMonth(inv.billing_month)}
                  </td>
                  <td className="px-3 py-2.5" title={inv.customerName}>
                    {shortCustomerName(inv.customerName)}
                  </td>
                  <td className="px-3 py-2.5">
                    {inv.dcNumbers.join(", ") || "Other charges only"}
                    <span className="block text-xs text-muted-foreground">
                      {inv.customerDcNumbers.join(", ")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    ₹{formatRupees(Number(inv.grand_total))}
                  </td>
                  <td className="px-3 py-2.5">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {inv.status === "issued" ? (
                      <PaymentStatusBadge status={inv.payment_status} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="space-x-2 px-3 py-2.5 text-right whitespace-nowrap">
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
                      aria-label={`Print ${inv.invoice_number}`}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {query ? "No invoice matches these filters." : "No invoices yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:hidden">
        {invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-muted-foreground">
                    {formatBillingMonth(inv.billing_month)} ·{" "}
                    {format(new Date(`${inv.invoice_date}T00:00:00`), "dd MMM yyyy")} ·{" "}
                    {shortCustomerName(inv.customerName)}
                  </p>
                </div>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <p className="text-muted-foreground">
                {inv.dcNumbers.join(", ") || "Other charges only"}
              </p>
              <p className="font-medium">₹{formatRupees(Number(inv.grand_total))}</p>
              <div className="flex gap-2">
                <Button
                  render={<Link href={`/dashboard/invoices/${inv.id}`} />}
                  variant="outline"
                  className="h-11 flex-1"
                >
                  View
                </Button>
                <Button
                  render={<Link href={`/dashboard/invoices/${inv.id}/print`} />}
                  variant="outline"
                  className="h-11 w-11"
                  aria-label={`Print ${inv.invoice_number}`}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {invoices.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query ? "No invoice matches these filters." : "No invoices yet."}
          </p>
        )}
      </div>
    </div>
  );
}

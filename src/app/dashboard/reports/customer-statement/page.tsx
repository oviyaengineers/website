import Link from "next/link";
import type { Metadata } from "next";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerStatementTable, StatementRateNote } from "@/components/customer-statement-table";
import {
  fetchCustomerStatement,
  fetchStatementComponents,
  fetchStatementCustomers,
  parseStatementFilters,
  statementQuery,
} from "@/lib/customer-statement-data";
import { statementDate } from "@/lib/customer-statement";
import { formatDate } from "@/lib/i18n/dates";

export const metadata: Metadata = { title: "Customer Statement | Oviya Engineers" };

type Search = { customer?: string; from?: string; to?: string; component?: string };

/**
 * Customer Statement: one customer's DCs over a period, with the Rate List
 * value of the completed work. A report only: it reads, it never writes.
 * Under /dashboard/reports, so it needs sign-in and the Billing PIN.
 * English only, like the other Billing screens.
 */
export default async function CustomerStatementPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const filters = parseStatementFilters(search);
  const [customers, components, result] = await Promise.all([
    fetchStatementCustomers(),
    fetchStatementComponents(),
    filters && filters.from <= filters.to ? fetchCustomerStatement(filters) : Promise.resolve(null),
  ]);

  // The picker keeps what was asked for; a new visit starts on this month.
  const today = new Date().toISOString().slice(0, 10);
  const from = statementDate(search.from) ?? `${today.slice(0, 8)}01`;
  const to = statementDate(search.to) ?? today;
  const backwards = filters ? filters.from > filters.to : false;
  const printHref = filters
    ? `/dashboard/reports/customer-statement/print?${statementQuery(filters)}`
    : null;
  const day = (value: string) => formatDate(value, "dd MMM yyyy", "en");

  return (
    <div className="space-y-6" lang="en">
      <div>
        <h1 className="text-2xl font-semibold">Customer Statement</h1>
        <p className="text-sm text-muted-foreground">
          Every issued DC of one customer in a period, by Our DC date, with the completed quantity
          and its value at the Rate List rate. Drafts and pending scans are not included.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            method="get"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <select
                id="customer"
                name="customer"
                required
                defaultValue={
                  filters?.customerId ?? (customers.length === 1 ? customers[0].id : "")
                }
                className="h-11 w-full rounded-md border bg-background px-3 text-sm sm:h-9"
              >
                <option value="" disabled>
                  Choose a customer
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="component">Component</Label>
              <select
                id="component"
                name="component"
                defaultValue={filters?.componentId ?? ""}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm sm:h-9"
              >
                <option value="">All components</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">From Date</Label>
              <Input id="from" name="from" type="date" required defaultValue={from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To Date</Label>
              <Input id="to" name="to" type="date" required defaultValue={to} />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
              >
                View Statement
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {backwards ? (
        <p role="alert" className="text-sm text-destructive">
          The From Date is after the To Date. Choose the dates again.
        </p>
      ) : null}

      {filters && !backwards && !result ? (
        <p role="alert" className="text-sm text-destructive">
          That customer could not be found.
        </p>
      ) : null}

      {filters && !backwards && result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Customer Name</dt>
              <dd className="font-semibold">{result.customerName}</dd>
              <dt className="text-muted-foreground">Component</dt>
              <dd>{result.componentName ?? "All components"}</dd>
              <dt className="text-muted-foreground">From Date</dt>
              <dd>{day(filters.from)}</dd>
              <dt className="text-muted-foreground">To Date</dt>
              <dd>{day(filters.to)}</dd>
            </dl>
            {printHref ? (
              <Button render={<Link href={printHref} />} variant="outline" className="h-11 sm:h-9">
                <Printer className="h-4 w-4" /> Print Statement
              </Button>
            ) : null}
          </div>
          {/* The table keeps every column; a phone scrolls across it. */}
          <div className="dc-list-print customer-statement-screen overflow-x-auto rounded-md border bg-white p-0 text-black">
            <CustomerStatementTable statement={result.statement} />
          </div>
          <StatementRateNote statement={result.statement} />
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BillingScrapReportDocument } from "@/components/billing-scrap-report-document";
import { fetchBillingScrapReport, resolveReportPeriod } from "@/lib/billing-scrap-report";
import { indiaToday } from "@/lib/india-date";
import { touchModuleUnlock } from "@/lib/module-lock-server";
import { unlockPathFor } from "@/lib/module-lock";

export const metadata: Metadata = { title: "Billing & Scrap Report | Oviya Engineers" };

type Search = { range?: string; month?: string; from?: string; to?: string };

/** Read-only period report for completed DCs, issued bills and recorded scrap. */
export default async function BillingScrapReportPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const query = new URLSearchParams(
    Object.entries(search).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();
  const returnTo = `/dashboard/reports/billing-scrap${query ? `?${query}` : ""}`;
  if (!(await touchModuleUnlock("weight"))) redirect(unlockPathFor("weight", returnTo));

  const { period, error } = resolveReportPeriod(search, indiaToday());
  const report = period ? await fetchBillingScrapReport(period.from, period.to) : null;
  const month = period?.month ?? search.month ?? indiaToday().slice(0, 7);
  const from = period?.range === "dates" ? period.from : "";
  const to = period?.range === "dates" ? period.to : "";
  const printQuery = period
    ? new URLSearchParams(
        period.range === "month"
          ? { range: "month", month: period.month }
          : { range: "dates", from: period.from, to: period.to }
      ).toString()
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing &amp; Scrap Report</h1>
          <p className="text-sm text-muted-foreground">
            Read-only summary of completed DCs, work values, issued bills and recorded scrap.
          </p>
        </div>
        {printQuery ? (
          <Button
            render={<Link href={`/dashboard/reports/billing-scrap/print?${printQuery}`} />}
            variant="outline"
            className="h-11 sm:h-9"
          >
            <Printer className="h-4 w-4" /> Print Report
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-2">
          <form action="/dashboard/reports/billing-scrap" method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="range" value="month" />
            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor="report-month">Select month</Label>
              <Input id="report-month" name="month" type="month" required defaultValue={month} />
            </div>
            <Button type="submit" className="h-11 sm:h-9">View Month</Button>
          </form>
          <form action="/dashboard/reports/billing-scrap" method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="range" value="dates" />
            <div className="space-y-2">
              <Label htmlFor="report-from">From date</Label>
              <Input id="report-from" name="from" type="date" required defaultValue={from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">To date</Label>
              <Input id="report-to" name="to" type="date" required defaultValue={to} />
            </div>
            <Button type="submit" variant="outline" className="h-11 sm:h-9">View Dates</Button>
          </form>
        </CardContent>
      </Card>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {period && report ? <BillingScrapReportDocument report={report} period={period} /> : null}
    </div>
  );
}

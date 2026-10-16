import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BillingScrapReportDocument } from "@/components/billing-scrap-report-document";
import { PrintPreview } from "@/components/print/print-preview";
import { fetchBillingScrapReport, resolveReportPeriod } from "@/lib/billing-scrap-report";
import { indiaToday } from "@/lib/india-date";
import { touchModuleUnlock } from "@/lib/module-lock-server";
import { unlockPathFor } from "@/lib/module-lock";

export const metadata: Metadata = { title: "Billing & Scrap Report | Oviya Engineers" };

type Search = { range?: string; month?: string; from?: string; to?: string };

export default async function BillingScrapReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const query = new URLSearchParams(
    Object.entries(search).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();
  const returnTo = `/dashboard/reports/billing-scrap/print${query ? `?${query}` : ""}`;
  if (!(await touchModuleUnlock("weight"))) redirect(unlockPathFor("weight", returnTo));

  const { period } = resolveReportPeriod(search, indiaToday());
  if (!period) redirect("/dashboard/reports/billing-scrap");
  const report = await fetchBillingScrapReport(period.from, period.to);
  const backQuery = new URLSearchParams(
    period.range === "month"
      ? { range: "month", month: period.month }
      : { range: "dates", from: period.from, to: period.to }
  ).toString();

  return (
    <PrintPreview back={{ href: `/dashboard/reports/billing-scrap?${backQuery}`, label: "Back" }} english>
      <div className="report-print-stage">
        <BillingScrapReportDocument report={report} period={period} />
      </div>
    </PrintPreview>
  );
}

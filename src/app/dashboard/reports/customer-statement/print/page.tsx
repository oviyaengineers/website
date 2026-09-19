import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrintPreview, ReportLetterhead } from "@/components/print/print-preview";
import { CustomerStatementTable, StatementRateNote } from "@/components/customer-statement-table";
import { fetchCustomerStatement, parseStatementFilters } from "@/lib/customer-statement-data";
import { formatDate } from "@/lib/i18n/dates";

export const metadata: Metadata = { title: "Customer Statement | Oviya Engineers" };

/**
 * The Customer Statement as a printout and its preview: English only, on
 * an A4 portrait sheet drawn at its real size on screen, with the
 * company letterhead, the customer and period, the full table (its headings
 * repeat on every page), the totals and the company's signature box.
 * Printed through the shared clean-PDF system, so no browser URL, date or
 * page number is added.
 */
export default async function CustomerStatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; from?: string; to?: string }>;
}) {
  const search = await searchParams;
  const filters = parseStatementFilters(search);
  if (!filters || filters.from > filters.to) redirect("/dashboard/reports/customer-statement");
  const result = await fetchCustomerStatement(filters);
  if (!result) notFound();

  const day = (value: string) => formatDate(value, "dd MMM yyyy", "en");
  const back = `/dashboard/reports/customer-statement?${new URLSearchParams({
    customer: filters.customerId,
    from: filters.from,
    to: filters.to,
  })}`;

  return (
    <PrintPreview back={{ href: back, label: "Back" }} english>
      <div className="report-print-stage" lang="en">
        <div className="dc-list-print statement-print space-y-4 bg-white p-4 text-black">
          <ReportLetterhead
            title="Customer Statement"
            details={
              <div className="mt-1 space-y-0.5 text-sm">
                <p>
                  <span className="font-semibold">Customer Name:</span> {result.customerName}
                </p>
                <p>
                  <span className="font-semibold">Period:</span> {day(filters.from)} to{" "}
                  {day(filters.to)}
                </p>
              </div>
            }
            aside={
              <>
                <p>By Our DC date. Drafts and pending scans are not included.</p>
                <p>Value = Completed DC Qty x Rate List rate.</p>
              </>
            }
          />
          <CustomerStatementTable statement={result.statement} />
          <StatementRateNote statement={result.statement} />
          <div className="statement-signature ml-auto flex min-h-24 w-72 flex-col justify-between border border-[#222] px-3 py-2 text-center text-sm">
            <p className="font-semibold">For OVIYA ENGINEERS</p>
            <p className="font-semibold">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </PrintPreview>
  );
}

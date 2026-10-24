import type { BillingScrapReport, ReportPeriod } from "@/lib/billing-scrap-report";
import { formatDate } from "@/lib/i18n/dates";
import { formatRupeesFromPaise } from "@/lib/weight";

function money(value: number | null): string {
  return value === null
    ? "—"
    : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function kilograms(mg: number | null): string {
  return mg === null ? "—" : `${(mg / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;
}

function qty(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function BillingScrapReportDocument({
  report,
  period,
}: {
  report: BillingScrapReport;
  period: ReportPeriod;
}) {
  const date = (value: string) => formatDate(value, "dd MMM yyyy", "en");
  const periodLabel =
    period.range === "month"
      ? formatDate(`${period.month}-01`, "MMMM yyyy", "en")
      : `${date(period.from)} to ${date(period.to)}`;
  const dcLineCount = report.dcs.reduce((sum, dc) => sum + dc.lines.length, 0);
  const recordedScrapLines = report.scrapLines.filter((line) => line.totalScrapMg !== null).length;
  const pendingScrapLines = report.scrapLines.length - recordedScrapLines;
  const totalIncome = report.totalDcValue + (report.scrapValuePaise ?? 0) / 100;
  const totalIncomeNote = report.unpricedScrapLines
    ? "DC work + priced scrap; unpriced scrap excluded"
    : "DC work + recorded scrap value";

  return (
    <article className="dc-list-print billing-scrap-print space-y-4 bg-white p-4 text-black">
      <header className="flex items-start justify-between gap-4 border-b border-[#222] pb-3">
        <div className="space-y-1">
          <p className="text-lg font-bold tracking-wide">OVIYA ENGINEERS</p>
          <h1 className="text-base font-semibold">Billing & Scrap Report</h1>
          <p><span className="font-semibold">Period:</span> {periodLabel}</p>
        </div>
        <p className="max-w-[30rem] text-right text-xs text-neutral-600">
          Read-only report. Completed DC work value uses Sent Qty × current Rate List rate.
          Invoice totals are actual issued bills. Scrap totals use recorded and archived records.
        </p>
      </header>

      <section aria-label="Period totals" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Summary label="Completed DCs" value={qty(report.completedDcs)} />
        <Summary label="DC work value" value={money(report.totalDcValue)} />
        <Summary label="Issued invoices" value={qty(report.invoices.length)} note={money(report.invoiceTotal)} />
        <Summary label="Recorded scrap" value={kilograms(report.recordedScrapMg)} />
        <Summary
          label="Scrap value"
          value={report.scrapValuePaise === null ? "—" : formatRupeesFromPaise(report.scrapValuePaise)}
        />
        <Summary label="Total Income" value={money(totalIncome)} note={totalIncomeNote} />
      </section>

      <section aria-label="Recorded scrap by material" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-300 p-3">
          <h2 className="text-sm font-bold">MS</h2>
          <p className="mb-2 text-xs text-neutral-600">Includes A105 and WCB</p>
          <div className="grid grid-cols-2 gap-2">
            <Summary label="Recorded weight" value={kilograms(report.scrapByMaterial.ms.totalScrapMg)} />
            <Summary
              label="Recorded value"
              value={report.scrapByMaterial.ms.valuePaise === null ? "—" : formatRupeesFromPaise(report.scrapByMaterial.ms.valuePaise)}
            />
          </div>
        </div>
        <div className="rounded-md border border-neutral-300 p-3">
          <h2 className="text-sm font-bold">Cf8m</h2>
          <p className="mb-2 text-xs text-neutral-600">Recorded scrap</p>
          <div className="grid grid-cols-2 gap-2">
            <Summary label="Recorded weight" value={kilograms(report.scrapByMaterial.cf8m.totalScrapMg)} />
            <Summary
              label="Recorded value"
              value={report.scrapByMaterial.cf8m.valuePaise === null ? "—" : formatRupeesFromPaise(report.scrapByMaterial.cf8m.valuePaise)}
            />
          </div>
        </div>
      </section>

      {report.unratedDcLines > 0 ? (
        <p className="text-xs text-neutral-700">
          {report.unratedDcLines} DC line(s) have no matching Rate List entry; their value is excluded.
        </p>
      ) : null}

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold">Delivery Challans and Work Value</h2>
          <p className="text-xs text-neutral-600">
            {report.dcs.length} DCs · {dcLineCount} lines · completed means every original line is reconciled.
          </p>
        </div>
        {report.dcs.length ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="text-left">DC Date</th>
                  <th className="text-left">DC No.</th>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Component / Material</th>
                  <th className="text-right">Sent Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Line Value</th>
                </tr>
              </thead>
              <tbody>
                {report.dcs.flatMap((dc) =>
                  dc.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="whitespace-nowrap">{date(dc.date)}</td>
                      <td className="whitespace-nowrap font-medium">{dc.number}</td>
                      <td>{dc.customer}</td>
                      <td>{dc.complete ? "Completed" : "Active"}</td>
                      <td>{line.component}{line.material ? ` / ${line.material}` : ""}</td>
                      <td className="text-right tabular-nums">{qty(line.sentQty)}</td>
                      <td className="text-right tabular-nums">{money(line.rate)}</td>
                      <td className="text-right tabular-nums">{money(line.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : <Empty>No delivery challans in this period.</Empty>}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold">Issued Bills</h2>
          <p className="text-xs text-neutral-600">Filtered by invoice date; GST and non-GST bills are included.</p>
        </div>
        {report.invoices.length ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="text-left">Invoice Date</th>
                  <th className="text-left">Invoice No.</th>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Bill Type</th>
                  <th className="text-right">Invoice Total</th>
                </tr>
              </thead>
              <tbody>
                {report.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="whitespace-nowrap">{date(invoice.date)}</td>
                    <td className="whitespace-nowrap font-medium">{invoice.number}</td>
                    <td>{invoice.customer}</td>
                    <td>{invoice.gstBill ? "GST" : "Non-GST"}</td>
                    <td className="text-right tabular-nums">{money(invoice.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No issued bills in this period.</Empty>}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold">Scrap Details</h2>
          <p className="text-xs text-neutral-600">
            {recordedScrapLines} recorded or archived lines · {pendingScrapLines} not recorded.
            {report.unpricedScrapLines > 0 ? ` ${report.unpricedScrapLines} recorded line(s) have no rate.` : ""}
          </p>
        </div>
        {report.scrapLines.length ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="text-left">DC Date</th>
                  <th className="text-left">DC No.</th>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Component / Material</th>
                  <th className="text-right">Sent Qty</th>
                  <th className="text-right">Scrap (kg)</th>
                  <th className="text-right">Rate / kg</th>
                  <th className="text-right">Scrap Value</th>
                  <th className="text-left">Record</th>
                </tr>
              </thead>
              <tbody>
                {report.scrapLines.map((line) => (
                  <tr key={line.id}>
                    <td className="whitespace-nowrap">{date(line.date)}</td>
                    <td className="whitespace-nowrap font-medium">{line.dcNumber}</td>
                    <td>{line.customer}</td>
                    <td>{line.component}{line.material ? ` / ${line.material}` : ""}</td>
                    <td className="text-right tabular-nums">{qty(line.sentQty)}</td>
                    <td className="text-right tabular-nums">{kilograms(line.totalScrapMg)}</td>
                    <td className="text-right tabular-nums">
                      {line.ratePaisePerKg === null ? "—" : `${formatRupeesFromPaise(line.ratePaisePerKg)} / kg`}
                    </td>
                    <td className="text-right tabular-nums">
                      {line.valuePaise === null ? "—" : formatRupeesFromPaise(line.valuePaise)}
                    </td>
                    <td>{line.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No scrap lines in this period.</Empty>}
      </section>
    </article>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-neutral-300 p-2">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      {note ? <p className="text-xs text-neutral-600">{note}</p> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-3 text-xs text-neutral-600">{children}</p>;
}


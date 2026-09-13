import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { shortCustomerName } from "@/lib/customer-name";
import {
  HISTORY_DATE_SOURCE_LABELS,
  HISTORY_KIND_LABELS,
  parseHistoryFilters,
  type HistoryFilters,
  type HistoryKind,
  type HistoryRecord,
} from "@/lib/dc-history";
import { fetchDcHistory } from "@/lib/dc-history-data";

export const metadata: Metadata = { title: "DC History | Oviya Engineers" };

const KIND_STYLES: Record<HistoryKind, string> = {
  scanned: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "dispatched-pending": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

function HistoryKindBadge({ kind }: { kind: HistoryKind }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${KIND_STYLES[kind]}`}
    >
      {HISTORY_KIND_LABELS[kind]}
    </Badge>
  );
}

function day(date: string): string {
  return format(new Date(`${date}T00:00:00`), "dd MMM yyyy");
}

function balanceText(record: HistoryRecord): string {
  if (record.balance === null) return "—";
  return record.balance < 0 ? `${-record.balance} extra` : String(record.balance);
}

function balanceClass(record: HistoryRecord): string {
  if (record.balance === null || record.balance === 0) return "text-muted-foreground";
  return record.balance < 0 ? "font-medium text-destructive" : "text-amber-600";
}

/** The query string for a set of filters, blanks left out. */
function queryOf(filters: HistoryFilters): string {
  return new URLSearchParams(
    Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]
  ).toString();
}

/**
 * Every DC record in a date range, oldest first: customer DCs scanned and still
 * waiting, and our challans pending or completed.
 *
 * A report, not a register. It reads the same master records as the Scanned
 * and Dispatched pages and stores nothing of its own, so filtering or
 * searching can never change a quantity, a balance or a status. Every filter
 * lives in the URL, so a refresh or a shared link shows the same rows.
 */
export default async function DcHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseHistoryFilters(await searchParams);
  const { records, summary, error, customerNames, componentNames } = await fetchDcHistory(filters);
  const query = queryOf(filters);
  const filtered = Boolean(query);

  const summaryCards: [string, number, string?][] = [
    ["Total records", summary.totalRecords],
    ["Scanned - Pending", summary.scannedPending, "text-teal-700 dark:text-teal-300"],
    ["Dispatched - Pending", summary.dispatchedPending, "text-blue-700 dark:text-blue-300"],
    ["Completed", summary.completed, "text-green-700 dark:text-green-300"],
  ];
  const quantityCards: [string, number][] = [
    ["Total received", summary.received],
    ["Total sent", summary.sent],
    ["Total material problem", summary.materialProblem],
    ["Total rejection", summary.rejection],
    ["Total balance", summary.balance],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DC History</h1>
          <p className="text-sm text-muted-foreground">
            Every DC record in a date range, oldest first. Our challans are dated by our DC date;
            scanned customer DCs by the date on the customer&apos;s DC, or the day scanned when no
            date was read.
          </p>
        </div>
        <Button
          render={<Link href={`/dashboard/dc/history/print${query ? `?${query}` : ""}`} />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <Printer className="h-4 w-4" /> Print history
        </Button>
      </div>

      {/* A GET form: Apply writes the filters into the URL, which is what the
          page reads, so refreshing or sharing the link keeps the same result.
          Keyed on the query so Clear resets the fields as well as the rows. */}
      <Form
        key={query}
        action="/dashboard/dc/history"
        className="flex flex-wrap items-end gap-3 [&_input]:h-11 [&_select]:h-11 sm:[&_input]:h-9 sm:[&_select]:h-9"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="history-from" className="text-xs text-muted-foreground">
            From date
          </label>
          <Input
            id="history-from"
            type="date"
            name="from"
            defaultValue={filters.from}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-to" className="text-xs text-muted-foreground">
            To date
          </label>
          <Input id="history-to" type="date" name="to" defaultValue={filters.to} className="w-40" />
        </div>
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor="history-q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="history-q"
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Our DC no., customer DC no., customer, component or material"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-56">
          <label htmlFor="history-customer" className="text-xs text-muted-foreground">
            Customer
          </label>
          <select
            id="history-customer"
            name="customer"
            defaultValue={filters.customer ?? ""}
            className="rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">All customers</option>
            {customerNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <label htmlFor="history-component" className="text-xs text-muted-foreground">
            Component
          </label>
          <select
            id="history-component"
            name="component"
            defaultValue={filters.component ?? ""}
            className="rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">All components</option>
            {componentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button type="submit" className="h-11 flex-1 sm:h-9 sm:flex-none">
            Apply Filter
          </Button>
          <Button
            render={<Link href="/dashboard/dc/history" />}
            variant="outline"
            className="h-11 flex-1 sm:h-9 sm:flex-none"
          >
            <X className="h-4 w-4" /> Clear Filter
          </Button>
        </div>
      </Form>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error} Choose a From date on or before the To date.
        </p>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {filters.from || filters.to
            ? `${filters.from ? day(filters.from) : "Earliest"} to ${filters.to ? day(filters.to) : "latest"}, both days included.`
            : "All dates. Choose a From and To date to narrow the history."}
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summaryCards.map(([label, value, tone]) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {quantityCards.map(([label, value]) => (
            <div key={label} className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Sent, material problem and rejection are counted on the challan that made them. Balance
          counts each original lot once, however many of its follow-ups are listed, plus what is
          received on scanned DCs waiting for our challan.
        </p>
      </div>

      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          {/* Sized to fit a 1280px laptop beside the sidebar with every column,
              Status and View included, in view. The customer's DC number rides
              under ours and the material under the part, rather than taking
              columns of their own; narrower screens scroll inside the card. */}
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-2.5 text-left font-medium">Date</th>
                <th className="px-2 py-2.5 text-left font-medium">DC No. / Customer DC</th>
                <th className="px-2 py-2.5 text-left font-medium">Customer</th>
                <th className="px-2 py-2.5 text-left font-medium">Component / Material</th>
                <th className="px-2 py-2.5 text-right font-medium">Received</th>
                <th className="px-2 py-2.5 text-right font-medium">Sent</th>
                <th className="px-2 py-2.5 text-right font-medium">Mat. Problem</th>
                <th className="px-2 py-2.5 text-right font-medium">Rejection</th>
                <th className="px-2 py-2.5 text-right font-medium">Balance</th>
                <th className="px-2 py-2.5 text-left font-medium">Status</th>
                <th className="px-2 py-2.5 text-right font-medium">View</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.key} className="border-b align-top last:border-b-0">
                  <td className="px-2 py-2.5">
                    <span className="whitespace-nowrap">{day(record.date)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {HISTORY_DATE_SOURCE_LABELS[record.dateSource]}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    {record.dcNumber ? (
                      <span className="font-medium whitespace-nowrap">{record.dcNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">Not yet raised</span>
                    )}
                    <span className="block text-xs whitespace-nowrap text-muted-foreground">
                      {record.customerDcNumbers.length > 0
                        ? record.customerDcNumbers.join(", ")
                        : "-"}
                    </span>
                    {record.followUpOf ? (
                      <span className="block text-xs text-muted-foreground">
                        Follow-up of{" "}
                        {record.followUpOf.dcId ? (
                          <Link
                            href={`/dashboard/dc/${record.followUpOf.dcId}`}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            {record.followUpOf.dcNumber}
                          </Link>
                        ) : (
                          record.followUpOf.dcNumber
                        )}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5" title={record.customerName}>
                    {shortCustomerName(record.customerName)}
                  </td>
                  <td className="min-w-[180px] px-2 py-2.5">
                    {record.component ?? "-"}
                    <span className="block text-xs text-muted-foreground">
                      {record.material ?? "-"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {record.received !== null ? (
                      record.received
                    ) : record.pending !== null ? (
                      <>
                        {record.pending}
                        <span className="block text-xs text-muted-foreground">
                          pending on {record.followUpOf?.dcNumber}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {record.sent}
                    {record.sentOnFollowUps > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        +{record.sentOnFollowUps} on follow-ups
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{record.materialProblem}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{record.rejection}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${balanceClass(record)}`}>
                    {balanceText(record)}
                    {record.followUpOf && record.balance !== null ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        left on {record.followUpOf.dcNumber}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5">
                    <HistoryKindBadge kind={record.kind} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Button render={<Link href={record.href} />} variant="outline" size="sm">
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted-foreground">
                    {error
                      ? "No range to show."
                      : filtered
                        ? "No DC record matches these filters."
                        : "No DC records yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Phone: the same records stacked, oldest first, every figure kept. */}
      <div className="grid gap-3 md:hidden">
        {records.map((record) => (
          <Card key={record.key}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{record.dcNumber ?? "Scanned customer DC"}</p>
                  <p className="text-muted-foreground">
                    {day(record.date)} · {shortCustomerName(record.customerName)}
                  </p>
                  {record.followUpOf ? (
                    <p className="text-xs text-muted-foreground">
                      Follow-up of {record.followUpOf.dcNumber}
                    </p>
                  ) : null}
                </div>
                <HistoryKindBadge kind={record.kind} />
              </div>
              <p className="font-medium">{record.component ?? "-"}</p>
              <p className="text-muted-foreground">
                {record.material ?? "-"} · customer DC{" "}
                {record.customerDcNumbers.length > 0 ? record.customerDcNumbers.join(", ") : "-"}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">
                  {record.received !== null ? "Received" : "Pending"}
                </dt>
                <dd className="text-right tabular-nums">
                  {record.received ?? record.pending ?? "—"}
                </dd>
                <dt className="text-muted-foreground">Sent</dt>
                <dd className="text-right tabular-nums">
                  {record.sent}
                  {record.sentOnFollowUps > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      +{record.sentOnFollowUps} on follow-ups
                    </span>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">Material problem</dt>
                <dd className="text-right tabular-nums">{record.materialProblem}</dd>
                <dt className="text-muted-foreground">Rejection</dt>
                <dd className="text-right tabular-nums">{record.rejection}</dd>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className={`text-right tabular-nums ${balanceClass(record)}`}>
                  {balanceText(record)}
                </dd>
              </dl>
              <Button
                render={<Link href={record.href} />}
                variant="outline"
                size="sm"
                className="h-11 w-full"
              >
                View
              </Button>
            </CardContent>
          </Card>
        ))}
        {records.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filtered ? "No DC record matches these filters." : "No DC records yet."}
          </p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { ComponentPicker } from "@/components/component-picker";
import {
  fetchComponentLedger,
  listComponents,
  LEDGER_STATUS_LABELS,
  type LedgerRow,
} from "@/lib/component-ledger";

export const metadata: Metadata = { title: "Component | Oviya Engineers" };

const STATUS_STYLES: Record<LedgerRow["status"], string> = {
  "pending-scan": "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * One component, and everything that has happened to it.
 *
 * The question this answers is "where are my castings": some scanned and not
 * yet entered, some on challans still owing work, some finished. They are
 * gathered from all three places, and every line keeps the challan it belongs
 * to so a quantity can always be traced back.
 */
export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ledger, components] = await Promise.all([fetchComponentLedger(id), listComponents()]);
  if (!ledger) notFound();

  const { summary } = ledger;

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={ledger.name} />
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Component
          </p>
          <h1 className="text-2xl font-semibold">{ledger.name}</h1>
        </div>
        <ComponentPicker components={components} current={ledger.id} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Figure label="Total received" value={summary.received} note="on our challans" />
        <Figure label="Total sent" value={summary.sent} />
        <Figure label="Material problem" value={summary.materialProblem} />
        <Figure label="Rejection" value={summary.rejection} />
        <Figure
          label="Current balance"
          value={summary.balance}
          note="received less sent, problem and rejection"
        />
      </div>

      {summary.awaitingEntry > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            A further <span className="font-semibold">{summary.awaitingEntry}</span> received on{" "}
            {summary.pendingScans} scanned customer DC
            {summary.pendingScans === 1 ? "" : "s"} that{" "}
            {summary.pendingScans === 1 ? "has" : "have"} not been entered yet. Those are not
            counted in the balance above, because no challan of ours exists for them.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">
            {ledger.rows.length} record{ledger.rows.length === 1 ? "" : "s"} for this component
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="p-3 text-left font-medium">Date</th>
                <th className="p-3 text-left font-medium">Customer</th>
                <th className="p-3 text-left font-medium">Customer DC No</th>
                <th className="p-3 text-left font-medium">Our DC No</th>
                <th className="p-3 text-left font-medium">Material</th>
                <th className="p-3 text-right font-medium">Received</th>
                <th className="p-3 text-right font-medium">Sent</th>
                <th className="p-3 text-right font-medium">Mat. Problem</th>
                <th className="p-3 text-right font-medium">Rejection</th>
                <th className="p-3 text-right font-medium">Balance</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-right font-medium">View</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((row) => (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="p-3 whitespace-nowrap">
                    {row.date ? format(new Date(row.date), "dd MMM yyyy") : "-"}
                  </td>
                  <td className="p-3">{row.customerName}</td>
                  <td className="p-3">{row.customerDcNumber}</td>
                  <td className="p-3 font-medium">{row.ourDcNumber ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{row.material ?? "-"}</td>
                  <td className="p-3 text-right tabular-nums">{row.received}</td>
                  <td className="p-3 text-right tabular-nums">{row.sent}</td>
                  <td className="p-3 text-right tabular-nums">{row.materialProblem}</td>
                  <td className="p-3 text-right tabular-nums">{row.rejection}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.balance === null ? "—" : row.balance}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={`border-transparent ${STATUS_STYLES[row.status]}`}
                    >
                      {LEDGER_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button render={<Link href={row.href} />} variant="outline" size="sm">
                      {row.source === "scan" ? "Scan" : "DC"}
                    </Button>
                  </td>
                </tr>
              ))}
              {ledger.rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted-foreground">
                    Nothing has been recorded against this component yet.
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

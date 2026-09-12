import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ComponentPicker } from "@/components/component-picker";
import { DcFilters } from "@/components/dc-filters";
import { SearchBox } from "@/components/search-box";
import { fetchDispatched, totalDispatched, type DispatchedTab } from "@/lib/dispatched-dcs";

export const metadata: Metadata = { title: "Dispatched DCs | Oviya Engineers" };

type Search = {
  q?: string;
  from?: string;
  to?: string;
  component?: string;
  customer?: string;
  tab?: string;
};

function Tab({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-[#10233f] text-[#10233f]"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{count}</span>
    </Link>
  );
}

/**
 * Delivery challans we have issued to the customer.
 *
 * Separate from Scanned DCs on purpose: a scan is the customer's paper coming
 * in, this is our challan going out. Pending and Completed are two views of
 * the same master records, told apart by what is still outstanding, so a
 * challan moves between them on its own as the sent quantity is filled in.
 */
export default async function DispatchedDcsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const filters = await searchParams;
  const tab: DispatchedTab = filters.tab === "completed" ? "completed" : "pending";

  const supabase = await createClient();
  const [{ pending, completed }, { data: picklist }, { data: customers }] = await Promise.all([
    fetchDispatched(filters),
    supabase
      .from("dc_picklist_items")
      .select("id, name, kind")
      .eq("kind", "component")
      .order("name"),
    supabase.from("customers").select("id, name").order("name"),
  ]);

  const rows = tab === "completed" ? completed : pending;
  const totals = totalDispatched(rows);

  const query = new URLSearchParams(
    Object.entries(filters).filter(([key, value]) => key !== "tab" && Boolean(value)) as [
      string,
      string,
    ][]
  );
  const tabHref = (which: DispatchedTab) => {
    const params = new URLSearchParams(query.toString());
    params.set("tab", which);
    return `/dashboard/dc/dispatched?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dispatched DCs</h1>
        <p className="text-sm text-muted-foreground">
          Our delivery challans, issued to the customer. Pending still has work outstanding;
          Completed is fully reconciled.
        </p>
      </div>

      <div className="space-y-3">
        <SearchBox placeholder="Our DC number, customer DC number, customer, component or material..." />
        {/* No status filter: the tabs below are the status. */}
        <DcFilters
          defaults={filters}
          components={(picklist ?? []).map((item) => item.name)}
          customers={(customers ?? []).map((c) => c.name)}
          showStatus={false}
        />
        <ComponentPicker components={picklist ?? []} />
      </div>

      <div className="flex border-b">
        <Tab
          label="Pending"
          count={pending.length}
          active={tab === "pending"}
          href={tabHref("pending")}
        />
        <Tab
          label="Completed"
          count={completed.length}
          active={tab === "completed"}
          href={tabHref("completed")}
        />
      </div>

      {/* Every quantity column stays visible and the table scrolls inside its
          own card. Balance is shown here on purpose: it is what the shop floor
          reconciles against, and it is deliberately absent from the printed
          challan the customer receives. */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="p-3 text-left font-medium">Our DC</th>
                <th className="p-3 text-left font-medium">DC date</th>
                <th className="p-3 text-left font-medium">Customer</th>
                <th className="p-3 text-left font-medium">Customer DC</th>
                <th className="p-3 text-left font-medium">Their date</th>
                <th className="p-3 text-left font-medium">Description</th>
                <th className="p-3 text-left font-medium">Material</th>
                <th className="p-3 text-right font-medium">Received</th>
                <th className="p-3 text-right font-medium">Sent</th>
                <th className="p-3 text-right font-medium">Mat. Problem</th>
                <th className="p-3 text-right font-medium">Rejection</th>
                <th className="p-3 text-right font-medium">Balance</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((dc) =>
                dc.lines.map((line, index) => (
                  <tr key={line.key} className="border-b last:border-b-0">
                    {index === 0 ? (
                      <>
                        <td rowSpan={dc.lines.length} className="p-3 font-medium">
                          {dc.dcNumber}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3 whitespace-nowrap">
                          {format(new Date(dc.dcDate), "dd MMM yyyy")}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3">
                          {dc.customerName}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3">
                          {line.customerDcNumber}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3 whitespace-nowrap">
                          {line.customerDcDate
                            ? format(new Date(line.customerDcDate), "dd MMM yyyy")
                            : "-"}
                        </td>
                      </>
                    ) : null}
                    <td className="p-3">{line.component}</td>
                    <td className="p-3 text-muted-foreground">{line.material ?? "-"}</td>
                    <td className="p-3 text-right tabular-nums">{line.received}</td>
                    <td className="p-3 text-right tabular-nums">{line.sent}</td>
                    <td className="p-3 text-right tabular-nums">{line.materialProblem}</td>
                    <td className="p-3 text-right tabular-nums">{line.rejection}</td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        line.balance > 0 ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    >
                      {line.balance}
                    </td>
                    {index === 0 ? (
                      <>
                        <td rowSpan={dc.lines.length} className="p-3">
                          <Badge
                            variant="outline"
                            className={`border-transparent ${
                              dc.balance > 0
                                ? "bg-blue-100 text-blue-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {dc.balance > 0 ? "Pending" : "Completed"}
                          </Badge>
                        </td>
                        <td
                          rowSpan={dc.lines.length}
                          className="space-x-2 p-3 text-right whitespace-nowrap"
                        >
                          <Button
                            render={<Link href={`/dashboard/dc/${dc.id}`} />}
                            variant="outline"
                            size="sm"
                          >
                            View
                          </Button>
                          <Button
                            render={<Link href={`/dashboard/dc/${dc.id}/print`} />}
                            variant="outline"
                            size="sm"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-muted-foreground">
                    {filters.q ||
                    filters.component ||
                    filters.from ||
                    filters.to ||
                    filters.customer
                      ? "No dispatched challan matches these filters."
                      : tab === "pending"
                        ? "Nothing is outstanding on a dispatched challan."
                        : "No dispatched challan is fully reconciled yet."}
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 font-medium">
                  <td colSpan={7} className="p-3">
                    Total
                  </td>
                  <td className="p-3 text-right tabular-nums">{totals.received}</td>
                  <td className="p-3 text-right tabular-nums">{totals.sent}</td>
                  <td className="p-3 text-right tabular-nums">{totals.materialProblem}</td>
                  <td className="p-3 text-right tabular-nums">{totals.rejection}</td>
                  <td className="p-3 text-right tabular-nums">{totals.balance}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Phone: the same figures stacked. Nothing is dropped, because a column
          hidden on a phone is a column the shop floor cannot check. */}
      <div className="grid gap-3 md:hidden">
        {rows.map((dc) => (
          <Card key={dc.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{dc.dcNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(dc.dcDate), "dd MMM yyyy")} · {dc.customerName}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`border-transparent ${
                    dc.balance > 0 ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                  }`}
                >
                  {dc.balance > 0 ? "Pending" : "Completed"}
                </Badge>
              </div>

              {dc.lines.map((line) => (
                <div key={line.key} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{line.component}</p>
                  <p className="text-muted-foreground">
                    {line.material ?? "-"} · their DC {line.customerDcNumber}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">Received</dt>
                    <dd className="text-right tabular-nums">{line.received}</dd>
                    <dt className="text-muted-foreground">Sent</dt>
                    <dd className="text-right tabular-nums">{line.sent}</dd>
                    <dt className="text-muted-foreground">Material problem</dt>
                    <dd className="text-right tabular-nums">{line.materialProblem}</dd>
                    <dt className="text-muted-foreground">Rejection</dt>
                    <dd className="text-right tabular-nums">{line.rejection}</dd>
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd
                      className={`text-right tabular-nums ${
                        line.balance > 0 ? "text-amber-600" : ""
                      }`}
                    >
                      {line.balance}
                    </dd>
                  </dl>
                </div>
              ))}

              <div className="flex gap-2">
                <Button
                  render={<Link href={`/dashboard/dc/${dc.id}`} />}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  View
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/${dc.id}/print`} />}
                  variant="outline"
                  size="sm"
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing to show in this tab.
          </p>
        )}
      </div>
    </div>
  );
}

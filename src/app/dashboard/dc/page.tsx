import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { FilePlus2, Plus, Printer, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComponentPicker } from "@/components/component-picker";
import { DcFilters } from "@/components/dc-filters";
import { SearchBox } from "@/components/search-box";
import { DeleteDcButton } from "@/components/delete-dc-button";
import { DcStatusBadge } from "@/components/status-badge";
import { isContinuationLine, type LineFigures } from "@/lib/dc-chain";
import { shortCustomerName } from "@/lib/customer-name";
import { fetchDcSummaries, totalDcSummaries, type DcSummary } from "@/lib/dc-list";

export const metadata: Metadata = { title: "All DCs | Oviya Engineers" };

type Search = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/**
 * One component's balance, worded for its direction.
 *
 * A follow-up line owes nothing of its own, so it shows a dash rather than a
 * zero that would read as "finished".
 */
function balanceText(line: LineFigures): { text: string; className: string } {
  const balance = line.balance;
  if (balance === null) return { text: "—", className: "text-muted-foreground" };
  if (balance < 0) return { text: `${-balance} extra`, className: "font-medium text-destructive" };
  if (balance > 0) return { text: `${balance} pending`, className: "text-amber-600" };
  return { text: "0", className: "text-muted-foreground" };
}

function refsOf(dc: DcSummary): string {
  return dc.customerDcNumbers.length > 0 ? dc.customerDcNumbers.join(", ") : "-";
}

/**
 * A challan that only despatches against lots received on earlier ones.
 *
 * Worth saying on the row: it received nothing itself, so a Received of zero
 * beside a Sent of fifty is correct rather than a mistake.
 */
function continuesEarlier(dc: DcSummary): boolean {
  return dc.items.length > 0 && dc.items.every(isContinuationLine);
}

/**
 * Where the follow-up button on a list row should lead.
 *
 * With one line outstanding there is no choice to make, so it opens the form
 * already filled in. With several, the challan's own page is the only place
 * the line can be chosen, and every line there carries the same button.
 */
function followUpHref(dc: DcSummary): string | null {
  // Only lines with room left once drafts are allowed for. A balance already
  // booked on a draft follow-up has nothing a new one could carry.
  const open = dc.outstandingLines.filter((line) => line.bookable > 0);
  if (open.length === 0) return null;
  if (open.length === 1) return `/dashboard/dc/new?from=${open[0].id}`;
  return `/dashboard/dc/${dc.id}`;
}

export default async function DcListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const supabase = await createClient();

  const [summaries, { profile }, { data: picklist }] = await Promise.all([
    fetchDcSummaries(filters),
    getCurrentUserAndProfile(),
    supabase
      .from("dc_picklist_items")
      .select("id, name, kind")
      .eq("kind", "component")
      .order("name"),
  ]);
  const isAdmin = profile?.role === "admin";
  const totals = totalDcSummaries(summaries);
  const printHref = `/dashboard/dc/print-list?${new URLSearchParams(
    Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]
  ).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">All DCs</h1>
          <p className="text-sm text-muted-foreground">
            {summaries.length} challan{summaries.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 [&>*]:h-11 sm:[&>*]:h-8">
          <Button render={<Link href={printHref} />} variant="outline">
            <Printer className="h-4 w-4" /> Print list
          </Button>
          <Button render={<Link href="/dashboard/dc/scan" />} variant="outline">
            <ScanLine className="h-4 w-4" /> Scan DC
          </Button>
          <Button render={<Link href="/dashboard/dc/new" />}>
            <Plus /> New DC
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <SearchBox placeholder="DC number, customer, their DC number, component or material..." />
        <DcFilters defaults={filters} components={(picklist ?? []).map((item) => item.name)} />
        {/* Straight to one part's full history, across scans, active challans
            and completed ones. The filters above narrow this list; this leaves
            it for the component's own ledger. */}
        <ComponentPicker components={picklist ?? []} />
      </div>

      {/* Desktop: one row per component, with the challan's own details
          spanning its rows. A single row per challan could not say which part
          a quantity belonged to, and a balance summed across two parts hides
          which one is still owed. Every quantity column stays visible, and the
          table scrolls inside its own card rather than widening the page. */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead>DC #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Their DC #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Mat. Problem</TableHead>
                <TableHead className="text-right">Rejection</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.flatMap((dc) => {
                // A challan with no items still gets its row, so an empty one
                // is visible rather than silently missing.
                const rows = dc.items.length > 0 ? dc.items : [null];
                const span = rows.length;
                return rows.map((item, index) => {
                  const line = item ? dc.lines[index] : null;
                  const balance = line ? balanceText(line) : null;
                  return (
                    <TableRow key={`${dc.id}-${item?.id ?? "empty"}`}>
                      {index === 0 && (
                        <>
                          <TableCell rowSpan={span} className="align-top font-medium">
                            {dc.dcNumber}
                            {continuesEarlier(dc) && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                continues an earlier challan
                              </span>
                            )}
                          </TableCell>
                          <TableCell rowSpan={span} className="align-top whitespace-nowrap">
                            {format(new Date(dc.dcDate), "dd MMM yyyy")}
                          </TableCell>
                          {/* Shortened for the column; the full name is on hover
                              and on the challan itself. */}
                          <TableCell
                            rowSpan={span}
                            className="max-w-[200px] align-top"
                            title={dc.customerName}
                          >
                            {shortCustomerName(dc.customerName)}
                          </TableCell>
                          <TableCell
                            rowSpan={span}
                            className="max-w-[160px] truncate align-top"
                            title={refsOf(dc)}
                          >
                            {refsOf(dc)}
                          </TableCell>
                        </>
                      )}
                      {/* A floor under the width: the other columns do not
                          wrap, so without one this was the column squeezed,
                          and a part name ran down six lines. */}
                      <TableCell className="min-w-[260px] max-w-[320px] whitespace-normal">
                        {item?.component ?? "-"}
                        {item?.material && (
                          <span className="block text-xs text-muted-foreground">
                            {item.material}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{line?.received ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {line?.sent ?? 0}
                        {/* An original line's Sent includes its confirmed
                            follow-ups, so the row adds up to its balance. */}
                        {line && !line.continues && line.sent !== line.ownSent && (
                          <span className="block text-xs text-muted-foreground">
                            {line.ownSent} on this DC
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{line?.materialProblem ?? 0}</TableCell>
                      <TableCell className="text-right">{line?.rejection ?? 0}</TableCell>
                      <TableCell className={`text-right ${balance?.className ?? ""}`}>
                        {balance?.text ?? "—"}
                        {line && line.onDraft > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {line.onDraft} on draft
                          </span>
                        )}
                      </TableCell>
                      {index === 0 && (
                        <>
                          <TableCell rowSpan={span} className="align-top">
                            <DcStatusBadge status={dc.lifecycle} />
                          </TableCell>
                          <TableCell
                            rowSpan={span}
                            className="space-x-2 text-right align-top whitespace-nowrap"
                          >
                            {followUpHref(dc) && (
                              <Button
                                render={<Link href={followUpHref(dc) as string} />}
                                variant="outline"
                                size="sm"
                              >
                                <FilePlus2 className="h-4 w-4" /> Follow-up
                              </Button>
                            )}
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
                            {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dcNumber} />}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                });
              })}
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                    No delivery challans match these filters.
                  </TableCell>
                </TableRow>
              )}
              {summaries.length > 0 && (
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right">{totals.received}</TableCell>
                  <TableCell className="text-right">{totals.sent}</TableCell>
                  <TableCell className="text-right">{totals.materialProblem}</TableCell>
                  <TableCell className="text-right">{totals.rejection}</TableCell>
                  <TableCell className="text-right">{totals.balance}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Phone: the same figures as a labelled stack, one block per component.
          Nothing is hidden here either — a column dropped on a phone is a
          column the shop floor cannot check. */}
      <div className="grid gap-3 md:hidden">
        {summaries.map((dc) => (
          <Card key={dc.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{dc.dcNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(dc.dcDate), "dd MMM yyyy")}
                  </p>
                </div>
                <DcStatusBadge status={dc.lifecycle} />
              </div>
              <div className="text-sm">
                <p title={dc.customerName}>{shortCustomerName(dc.customerName)}</p>
                <p className="text-muted-foreground">Their DC #: {refsOf(dc)}</p>
                {continuesEarlier(dc) && (
                  <p className="text-muted-foreground">Continues an earlier challan</p>
                )}
              </div>

              {dc.items.map((item, index) => {
                const line = dc.lines[index];
                const balance = balanceText(line);
                return (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{item.component}</p>
                    {item.material && <p className="text-muted-foreground">{item.material}</p>}
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">Received</dt>
                      <dd className="text-right">{line.received}</dd>
                      <dt className="text-muted-foreground">Sent</dt>
                      <dd className="text-right">
                        {line.sent}
                        {!line.continues && line.sent !== line.ownSent && (
                          <span className="block text-xs text-muted-foreground">
                            {line.ownSent} on this DC
                          </span>
                        )}
                      </dd>
                      <dt className="text-muted-foreground">Material problem</dt>
                      <dd className="text-right">{line.materialProblem}</dd>
                      <dt className="text-muted-foreground">Rejection</dt>
                      <dd className="text-right">{line.rejection}</dd>
                      <dt className="text-muted-foreground">Balance</dt>
                      <dd className={`text-right ${balance.className}`}>
                        {balance.text}
                        {line.onDraft > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {line.onDraft} on draft
                          </span>
                        )}
                      </dd>
                    </dl>
                  </div>
                );
              })}

              {/* A full thumb's height, delete included: it sits beside
                  print, and a missed tap there is the expensive one. */}
              {followUpHref(dc) && (
                <Button
                  render={<Link href={followUpHref(dc) as string} />}
                  variant="outline"
                  size="sm"
                  className="h-11 w-full sm:h-8"
                >
                  <FilePlus2 className="h-4 w-4" /> Create Follow-up DC
                </Button>
              )}
              <div className="flex gap-2 [&>*]:h-11 sm:[&>*]:h-8">
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
                {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dcNumber} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {summaries.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No delivery challans match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

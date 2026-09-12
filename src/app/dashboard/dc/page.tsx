import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Plus, Printer, ScanLine } from "lucide-react";
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
import { isContinuationLine } from "@/lib/dc-chain";
import { fetchDcSummaries, totalDcSummaries, type DcSummary } from "@/lib/dc-list";

export const metadata: Metadata = { title: "All DCs | Oviya Engineers" };

type Search = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/** The balance column reads differently in each direction, so it says which. */
function balanceText(balance: number): { text: string; className: string } {
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

      {/* Desktop: every quantity column stays visible, and the table scrolls
          inside its own card rather than dropping columns or widening the
          page. Which columns matter is not ours to decide — the operator
          reconciles against all of them. */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow>
                <TableHead>DC #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Their DC #</TableHead>
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
              {summaries.map((dc) => {
                const balance = balanceText(dc.balance);
                return (
                  <TableRow key={dc.id}>
                    <TableCell className="font-medium">
                      {dc.dcNumber}
                      {continuesEarlier(dc) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          continues an earlier challan
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(dc.dcDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>{dc.customerName}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={refsOf(dc)}>
                      {refsOf(dc)}
                    </TableCell>
                    <TableCell className="text-right">{dc.received}</TableCell>
                    <TableCell className="text-right">{dc.sent}</TableCell>
                    <TableCell className="text-right">{dc.materialProblem}</TableCell>
                    <TableCell className="text-right">{dc.rejection}</TableCell>
                    <TableCell className={`text-right ${balance.className}`}>
                      {balance.text}
                    </TableCell>
                    <TableCell>
                      <DcStatusBadge status={dc.lifecycle} />
                    </TableCell>
                    <TableCell className="space-x-2 text-right whitespace-nowrap">
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
                  </TableRow>
                );
              })}
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    No delivery challans match these filters.
                  </TableCell>
                </TableRow>
              )}
              {summaries.length > 0 && (
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={4}>Total</TableCell>
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

      {/* Phone: the same figures as a labelled stack. Nothing is hidden here
          either — a column dropped on a phone is a column the shop floor
          cannot check. */}
      <div className="grid gap-3 md:hidden">
        {summaries.map((dc) => {
          const balance = balanceText(dc.balance);
          return (
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
                  <p>{dc.customerName}</p>
                  <p className="text-muted-foreground">Their DC #: {refsOf(dc)}</p>
                  {continuesEarlier(dc) && (
                    <p className="text-muted-foreground">Continues an earlier challan</p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Received</dt>
                  <dd className="text-right">{dc.received}</dd>
                  <dt className="text-muted-foreground">Sent</dt>
                  <dd className="text-right">{dc.sent}</dd>
                  <dt className="text-muted-foreground">Material problem</dt>
                  <dd className="text-right">{dc.materialProblem}</dd>
                  <dt className="text-muted-foreground">Rejection</dt>
                  <dd className="text-right">{dc.rejection}</dd>
                  <dt className="text-muted-foreground">Balance</dt>
                  <dd className={`text-right ${balance.className}`}>{balance.text}</dd>
                </dl>
                {/* A full thumb's height, delete included: it sits beside
                    print, and a missed tap there is the expensive one. */}
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
          );
        })}
        {summaries.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No delivery challans match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { challanSettledIn, figuresFor, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { dcLifecycle } from "@/lib/dc-lifecycle";
import { listRelatedDcs } from "@/lib/actions/dc-continuation";
import { fetchDcBilling } from "@/lib/billing-data";
import { BillingStatusBadge } from "@/components/billing-badges";
import { DcStatusBadge } from "@/components/status-badge";
import { DcStatusActions } from "@/components/dc-status-actions";
import { DeleteDcButton } from "@/components/delete-dc-button";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { AlertTriangle, Pencil, Printer } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcDetail.pageTitle")} | Oviya Engineers` };
}

export default async function DcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ profile }, { t, lang }] = await Promise.all([
    getCurrentUserAndProfile(),
    getTranslator(),
  ]);
  const isAdmin = profile?.role === "admin";
  const day = (value: string) => formatDate(value, "dd MMM yyyy", lang);

  const { data: dc } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (!dc) notFound();

  const [{ data: items }, { data: customer }, { data: picklist }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);
  // The master list owns the spelling wherever a row carries a component id.
  const componentNames = componentNameIndex(picklist ?? []);

  // Every line on file, marked draft or not, through the same calculation as
  // every other screen. Confirmed despatches on later challans are counted, or
  // a line completed elsewhere would still read as outstanding here; draft
  // ones are not, or a line would read as finished before anything went out.
  const chainRows = await fetchChainRows(supabase);
  const chain = indexChain(chainRows);
  const figures = new Map((items ?? []).map((item) => [item.id, figuresFor(item, chain)]));

  const [related, billing] = await Promise.all([listRelatedDcs(id), fetchDcBilling(id)]);
  // A balance error is any line with more out than in once confirmed
  // follow-ups are counted, so it is judged from the figures, not the row.
  const overDelivered = (items ?? []).flatMap((item, index) => {
    const line = figures.get(item.id);
    if (!line || line.balance === null || line.balance >= 0) return [];
    return [
      {
        position: index + 1,
        component: componentNameOf(item, componentNames),
        received: line.received,
        outward: line.total,
        extra: -line.balance,
      },
    ];
  });
  const lifecycle = dcLifecycle(dc.status, items ?? [], challanSettledIn(items ?? [], chain));

  // Whether this challan counts, read from the same snapshot of lines as the
  // balances, not from the challan row read a moment earlier: confirmed in
  // between, the two disagreed and the page took the same quantity off twice.
  const ownChainRows = chainRows.filter((row) => row.dc_id === id);
  const isDraft =
    ownChainRows.length > 0 ? ownChainRows.every((row) => row.draft) : lifecycle === "draft";

  // For a follow-up: the original each row despatches against, and what this
  // challan does to it. Read from the shared figures, so the card cannot drift
  // from the table below or from the lists. One entry per original, however
  // many rows despatch against it.
  const followUpOf = new Map<
    string,
    { dcId: string; dcNumber: string; component: string; now: number; here: number }
  >();
  for (const item of items ?? []) {
    const line = figures.get(item.id);
    if (!line || line.pending === null || line.after === null || !line.rootDcId) continue;
    const component = componentNameOf(item, componentNames);
    const key = `${line.rootDcId}|${component}`;
    if (followUpOf.has(key)) continue;
    followUpOf.set(key, {
      dcId: line.rootDcId,
      dcNumber: line.rootDcNumber ?? t("dcDetail.anEarlierChallan"),
      component,
      // The card words a draft as "owed now, and after confirming", and a
      // confirmed challan as "what it despatched, and what is left".
      now: isDraft ? line.pending : line.after,
      here: line.pending - line.after,
    });
  }

  const followUpCount = new Set(related.map((row) => row.dcNumber)).size;

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={dc.dc_number} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dc.dc_number}</h1>
          <p className="text-sm text-muted-foreground">{day(dc.dc_date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DcStatusBadge status={lifecycle} />
          <DcStatusActions id={dc.id} lifecycle={lifecycle} />
          <Button render={<Link href={`/dashboard/dc/${dc.id}/print`} />} variant="outline">
            <Printer className="h-4 w-4" /> {t("common.print")}
          </Button>
          {/* A completed challan is reconciled and often already invoiced, so
              editing it is behind Reopen rather than one tap away. */}
          {lifecycle !== "completed" && (
            <Button render={<Link href={`/dashboard/dc/${dc.id}/edit`} />} variant="outline">
              <Pencil className="h-4 w-4" /> {t("common.edit")}
            </Button>
          )}
          {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dc_number} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("common.customer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {/* A line is printed only when there is something on it. A dash
                standing in for a missing phone number read as part of the
                address and left a gap above it. */}
            <p className="font-medium">{customer?.name ?? "-"}</p>
            {customer?.phone && <p className="text-muted-foreground">{customer.phone}</p>}
            {customer?.address && <p className="text-muted-foreground">{customer.address}</p>}
            {dc.customer_dc_number && dc.customer_dc_number.length > 0 ? (
              dc.customer_dc_number.map((num, i) => (
                <p key={i}>
                  {t("dcDetail.customerDcNo", {
                    value: `${num || "-"}${
                      dc.customer_dc_date?.[i] ? ` (${day(dc.customer_dc_date[i] as string)})` : ""
                    }`,
                  })}
                </p>
              ))
            ) : (
              <p>{t("dcDetail.customerDcNo", { value: "-" })}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dcDetail.authorization")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{t("dcDetail.authorizedBy", { name: dc.authorized_by ?? "-" })}</p>
          </CardContent>
        </Card>
      </div>

      {overDelivered.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {overDelivered.length === 1
                ? t("dcDetail.balanceErrorOne")
                : t("dcDetail.balanceError", { count: overDelivered.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-destructive">
            {overDelivered.map((row) => (
              <p key={row.position}>
                {t("dcDetail.rowPrefix", { row: row.position })} —{" "}
                <span className="font-medium">{row.component}</span>
                {t("dcDetail.rowFigures", { received: row.received, outward: row.outward })} —{" "}
                <span className="font-medium">{t("dc.list.extra", { count: row.extra })}.</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {followUpOf.size > 0 && (
        <Card className="border-t-4 border-t-amber-500 bg-amber-50/60">
          <CardContent className="space-y-3 py-4 text-sm">
            {[...followUpOf.values()].map((entry) => {
              const after = isDraft ? entry.now - entry.here : entry.now;
              return (
                <div
                  key={`${entry.dcId}-${entry.component}`}
                  className="space-y-0.5 text-amber-900"
                >
                  <p className="font-medium">
                    {t("dcDetail.followUpOf")}{" "}
                    <Link href={`/dashboard/dc/${entry.dcId}`} className="underline">
                      {entry.dcNumber}
                    </Link>
                  </p>
                  <p>{entry.component}</p>
                  {isDraft ? (
                    <p>{t("dcDetail.draftNote", { now: entry.now, here: entry.here, after })}</p>
                  ) : (
                    <p>{t("dcDetail.confirmedNote", { here: entry.here, now: entry.now })}</p>
                  )}
                  {after < 0 && (
                    <p className="font-medium text-destructive">
                      {t("dcDetail.overRemaining", { count: -after })}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dcDetail.materialDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("dc.cols.description")}</TableHead>
                <TableHead>{t("common.material")}</TableHead>
                {/* Named for what the column holds, as on the follow-up form:
                    a follow-up receives nothing, so its figure is what is
                    pending on the line it continues. */}
                <TableHead>
                  {(items ?? []).length > 0 && (items ?? []).every((i) => i.parent_item_id)
                    ? t("dc.qty.pending")
                    : t("dcDetail.receivedQty")}
                </TableHead>
                <TableHead>{t("dcDetail.sentQty")}</TableHead>
                <TableHead>{t("dcDetail.materialProblem")}</TableHead>
                <TableHead>{t("dc.qty.rejection")}</TableHead>
                <TableHead>{t("dc.qty.total")}</TableHead>
                <TableHead>{t("dc.qty.balance")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => {
                const line = figures.get(item.id) ?? figuresFor(item, chain);
                // A follow-up row reads from the original line it continues:
                // pending there without this challan, and what is left once
                // this challan counts. The same pending-minus-sent reckoning
                // the follow-up form uses, so the two pages agree.
                // Taken from the shared figures, so this page cannot drift from
                // All DCs and Dispatched, which read the same pair.
                const pending = line.pending;
                const balance = line.continues ? line.after : line.balance;
                const entry =
                  line.continues && line.rootDcNumber ? { dcNumber: line.rootDcNumber } : undefined;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{componentNameOf(item, componentNames)}</TableCell>
                    <TableCell>{item.material ?? "-"}</TableCell>
                    <TableCell>
                      {entry && pending !== null ? (
                        <>
                          {pending}
                          <span className="block text-xs text-muted-foreground">
                            {t("dc.list.pendingOn", { dc: entry.dcNumber })}
                          </span>
                        </>
                      ) : line.continues ? (
                        "—"
                      ) : (
                        line.received
                      )}
                    </TableCell>
                    <TableCell>
                      {line.sent}
                      {/* An original line's Sent includes its confirmed
                          follow-ups, so the row adds up to its balance. This
                          challan's own figure is shown beneath when they differ. */}
                      {!line.continues && line.sent !== line.ownSent && (
                        <span className="block text-xs text-muted-foreground">
                          {t("dc.list.onThisDc", { count: line.ownSent })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{line.materialProblem}</TableCell>
                    <TableCell>{line.rejection}</TableCell>
                    <TableCell>{line.total}</TableCell>
                    <TableCell
                      className={
                        balance === null
                          ? "text-muted-foreground"
                          : balance < 0
                            ? "font-medium text-destructive"
                            : balance > 0
                              ? "text-amber-600"
                              : "text-muted-foreground"
                      }
                    >
                      {balance === null
                        ? "—"
                        : balance < 0
                          ? t("dc.list.extra", { count: -balance })
                          : balance > 0
                            ? t("dc.list.pendingCount", { count: balance })
                            : "0"}
                      {line.onDraft > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {t("dcDetail.onDraftNotCounted", { count: line.onDraft })}
                        </span>
                      )}
                      {entry && (
                        <span className="block text-xs text-muted-foreground">
                          {isDraft
                            ? t("dc.list.leftOnOnceConfirmed", { dc: entry.dcNumber })
                            : t("dc.list.leftOn", { dc: entry.dcNumber })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {/* Offered while there is room left once drafts are
                          allowed for. A follow-up line never offers one: it
                          owes nothing of its own. */}
                      {line.bookable > 0 && (
                        <Button
                          render={<Link href={`/dashboard/dc/new?from=${item.id}`} />}
                          variant="outline"
                          size="sm"
                          className="h-11 sm:h-7"
                        >
                          <FilePlus2 className="h-4 w-4" /> {t("dc.list.createFollowUp")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Billing reads the DC lines through dc_line_billing: billable is Sent
          once the DC is issued, billed is what issued invoices hold. */}
      {billing.size > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base text-[#10233f]">{t("nav.billing")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("dcDetail.billingMonth", {
                  month: formatDate([...billing.values()][0].billingMonth, "MMMM yyyy", lang),
                })}
              </p>
            </div>
            {[...billing.values()].some((line) => line.unbilled > 0) ? (
              <Button
                render={
                  <Link
                    href={`/dashboard/invoices/new?customer=${dc.customer_id}&month=${[...billing.values()][0].billingMonth.slice(0, 7)}&dc=${dc.id}`}
                  />
                }
                variant="outline"
                size="sm"
                className="h-11 sm:h-8"
              >
                <FilePlus2 className="h-4 w-4" /> {t("dcDetail.billThisDc")}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dcDetail.componentMaterial")}</TableHead>
                  <TableHead className="text-right">{t("dcDetail.sentBillable")}</TableHead>
                  <TableHead className="text-right">{t("dcDetail.billed")}</TableHead>
                  <TableHead className="text-right">{t("dcDetail.unbilled")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("dcDetail.invoices")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((item) => {
                  const line = billing.get(item.id);
                  if (!line) return null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-normal">
                        {componentNameOf(item, componentNames)}
                        <span className="block text-xs text-muted-foreground">
                          {item.material ?? "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{line.sent}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.billed}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.unbilled}</TableCell>
                      <TableCell>
                        <BillingStatusBadge status={line.status} />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {line.invoices.length === 0
                          ? "-"
                          : line.invoices.map((inv) => (
                              <span key={inv.id} className="block">
                                <Link
                                  href={`/dashboard/invoices/${inv.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {inv.invoiceNumber}
                                </Link>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {inv.quantity}
                                  {inv.status === "cancelled"
                                    ? ` · ${t("dcDetail.cancelled")}`
                                    : ""}
                                </span>
                              </span>
                            ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {related.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">
              {t("dcDetail.followUpHistory")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {followUpCount === 1
                ? t("dcDetail.followUpCountOne")
                : t("dcDetail.followUpCount", { count: followUpCount })}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dcDetail.followUpDcNo")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.component")}</TableHead>
                  <TableHead>{t("common.material")}</TableHead>
                  <TableHead className="text-right">{t("dc.qty.sent")}</TableHead>
                  <TableHead className="text-right">{t("dc.qty.matProblem")}</TableHead>
                  <TableHead className="text-right">{t("dc.qty.rejection")}</TableHead>
                  <TableHead className="text-right">{t("dcDetail.remainingBalance")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {related.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/dc/${row.dcId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.dcNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.dcDate ? day(row.dcDate) : "-"}
                    </TableCell>
                    <TableCell className="min-w-[200px] whitespace-normal">
                      {row.component}
                    </TableCell>
                    <TableCell>{row.material ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.sent}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.materialProblem}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.rejection}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        row.remainingAfter === null
                          ? "text-muted-foreground"
                          : row.remainingAfter < 0
                            ? "font-medium text-destructive"
                            : row.remainingAfter > 0
                              ? "text-amber-600"
                              : "text-muted-foreground"
                      }`}
                    >
                      {row.remainingAfter === null
                        ? "—"
                        : row.remainingAfter < 0
                          ? t("dc.list.extra", { count: -row.remainingAfter })
                          : row.remainingAfter}
                    </TableCell>
                    <TableCell>
                      {row.draft ? (
                        <DcStatusBadge status="draft" />
                      ) : (
                        // Pending while anything is left on the original line,
                        // Completed at exactly zero.
                        <Badge
                          variant="outline"
                          className={`border-transparent ${
                            row.remainingAfter === 0
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {row.remainingAfter === 0
                            ? t("dc.lifecycle.completed")
                            : t("dcDetail.pendingStatus")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="space-x-2 text-right whitespace-nowrap">
                      <Button
                        render={<Link href={`/dashboard/dc/${row.dcId}`} />}
                        variant="outline"
                        size="sm"
                        className="h-11 sm:h-7"
                      >
                        {t("common.view")}
                      </Button>
                      <Button
                        render={<Link href={`/dashboard/dc/${row.dcId}/print`} />}
                        variant="outline"
                        size="sm"
                        className="h-11 sm:h-7"
                        aria-label={t("dc.list.printDc", { dc: row.dcNumber })}
                      >
                        <Printer className="h-4 w-4" /> {t("common.print")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Split, because only confirmed follow-ups reduce the balance
                    above. A draft is listed so it is not forgotten, but it has
                    not gone out yet. */}
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={4}>{t("dcDetail.confirmedAgainst")}</TableCell>
                  <TableCell className="text-right">
                    {related
                      .filter((row) => !row.draft)
                      .reduce((total, row) => total + row.sent, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {related
                      .filter((row) => !row.draft)
                      .reduce((total, row) => total + row.materialProblem, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {related
                      .filter((row) => !row.draft)
                      .reduce((total, row) => total + row.rejection, 0)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
                {related.some((row) => row.draft) && (
                  <TableRow className="text-muted-foreground">
                    <TableCell colSpan={4}>{t("dcDetail.onDraftsNotCounted")}</TableCell>
                    <TableCell className="text-right">
                      {related
                        .filter((row) => row.draft)
                        .reduce((total, row) => total + row.sent, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {related
                        .filter((row) => row.draft)
                        .reduce((total, row) => total + row.materialProblem, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {related
                        .filter((row) => row.draft)
                        .reduce((total, row) => total + row.rejection, 0)}
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="text-sm font-medium">
          {t("dcDetail.sentAfterMachining")}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { FilePlus2, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ComponentPicker } from "@/components/component-picker";
import { DcFilters } from "@/components/dc-filters";
import { SearchBox } from "@/components/search-box";
import { fetchDispatched, totalDispatched, type DispatchedTab } from "@/lib/dispatched-dcs";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("nav.dispatchedDcs")} | Oviya Engineers` };
}

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
  const [{ pending, completed }, { data: picklist }, { data: customers }, { t, lang }] =
    await Promise.all([
      fetchDispatched(filters),
      supabase
        .from("dc_picklist_items")
        .select("id, name, kind")
        .eq("kind", "component")
        .order("name"),
      supabase.from("customers").select("id, name").order("name"),
      getTranslator(),
    ]);
  const day = (value: string) => formatDate(value, "dd MMM yyyy", lang);

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
        <h1 className="text-2xl font-semibold">{t("nav.dispatchedDcs")}</h1>
        <p className="text-sm text-muted-foreground">{t("dcViews.dispatchedIntro")}</p>
      </div>

      <div className="space-y-3">
        <SearchBox placeholder={t("dcViews.stockSearch")} />
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
          label={t("dcViews.tabPending")}
          count={pending.length}
          active={tab === "pending"}
          href={tabHref("pending")}
        />
        <Tab
          label={t("dcViews.tabCompleted")}
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
                <th className="p-3 text-left font-medium">{t("dc.cols.ourDc")}</th>
                <th className="p-3 text-left font-medium">{t("dcViews.dcDate")}</th>
                <th className="p-3 text-left font-medium">{t("common.customer")}</th>
                <th className="p-3 text-left font-medium">{t("dc.cols.customerDc")}</th>
                <th className="p-3 text-left font-medium">{t("dcViews.theirDate")}</th>
                <th className="p-3 text-left font-medium">{t("dc.cols.description")}</th>
                <th className="p-3 text-left font-medium">{t("common.material")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.received")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.sent")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.matProblem")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.rejection")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.balance")}</th>
                <th className="p-3 text-left font-medium">{t("common.status")}</th>
                <th className="p-3 text-right font-medium">{t("common.actions")}</th>
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
                          {day(dc.dcDate)}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3">
                          {dc.customerName}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3">
                          {line.customerDcNumber}
                        </td>
                        <td rowSpan={dc.lines.length} className="p-3 whitespace-nowrap">
                          {line.customerDcDate ? day(line.customerDcDate) : "-"}
                        </td>
                      </>
                    ) : null}
                    <td className="p-3">
                      {line.component}
                      {/* A continuation despatches a lot received on an earlier
                          challan, so it shows no Received of its own. Saying so
                          stops the zero reading as a mistake. */}
                      {line.continues && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("dc.list.continuesEarlier")}
                        </span>
                      )}
                      {/* Offered only while there is room left once drafts are
                          allowed for; a balance already booked on a draft has
                          nothing a new follow-up could carry. */}
                      {line.bookable > 0 && (
                        <Button
                          render={<Link href={`/dashboard/dc/new?from=${line.key}`} />}
                          variant="outline"
                          size="xs"
                          className="ml-2 align-middle"
                        >
                          <FilePlus2 className="h-3 w-3" /> {t("dc.list.createFollowUp")}
                        </Button>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{line.material ?? "-"}</td>
                    {/* A follow-up received nothing, so it shows what is
                        pending on the original it continues instead. */}
                    <td className="p-3 text-right tabular-nums">
                      {line.pending !== null ? (
                        <>
                          {line.pending}
                          <span className="block text-xs text-muted-foreground">
                            {t("dc.list.pendingOn", { dc: line.rootDcNumber })}
                          </span>
                        </>
                      ) : (
                        line.received
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {line.sent}
                      {/* The original's Sent includes confirmed follow-ups, so
                          the row adds up to its balance. Its own figure is
                          shown beneath whenever the two differ. */}
                      {!line.continues && line.sent !== line.ownSent && (
                        <span className="block text-xs text-muted-foreground">
                          {t("dc.list.onThisDc", { count: line.ownSent })}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{line.materialProblem}</td>
                    <td className="p-3 text-right tabular-nums">{line.rejection}</td>
                    {/* A follow-up owes nothing itself, so its cell shows what
                        is left on the original it continues, and says whose. */}
                    <td
                      className={`p-3 text-right tabular-nums ${
                        (line.balance ?? line.after) === null
                          ? "text-muted-foreground"
                          : (line.balance ?? line.after ?? 0) < 0
                            ? "font-medium text-destructive"
                            : (line.balance ?? line.after ?? 0) > 0
                              ? "text-amber-600"
                              : "text-muted-foreground"
                      }`}
                    >
                      {(line.balance ?? line.after) === null
                        ? "—"
                        : (line.balance ?? line.after ?? 0) < 0
                          ? t("dc.list.extra", { count: -(line.balance ?? line.after ?? 0) })
                          : (line.balance ?? line.after)}
                      {line.onDraft > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("dc.list.onDraft", { count: line.onDraft })}
                        </span>
                      )}
                      {line.continues && line.after !== null && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("dc.list.leftOn", { dc: line.rootDcNumber })}
                        </span>
                      )}
                    </td>
                    {index === 0 ? (
                      <>
                        <td rowSpan={dc.lines.length} className="p-3">
                          <Badge
                            variant="outline"
                            className={`border-transparent ${
                              dc.settled
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {dc.settled ? t("dcViews.tabCompleted") : t("dcViews.tabPending")}
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
                            {t("common.view")}
                          </Button>
                          <Button
                            render={<Link href={`/dashboard/dc/${dc.id}/print`} />}
                            variant="outline"
                            size="sm"
                            aria-label={t("dc.list.printDc", { dc: dc.dcNumber })}
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
                      ? t("dcViews.dispatchedNoMatch")
                      : tab === "pending"
                        ? t("dcViews.dispatchedNothingOutstanding")
                        : t("dcViews.dispatchedNoneReconciled")}
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 font-medium">
                  <td colSpan={7} className="p-3">
                    {t("dc.qty.total")}
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
          hidden on a phone is a column the shop floor cannot check. The actions
          are raised to a full thumb's width: this is read standing at a machine,
          often with gloves on, and the desktop button height is not tappable. */}
      <div className="grid gap-3 md:hidden">
        {rows.map((dc) => (
          <Card key={dc.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{dc.dcNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {day(dc.dcDate)} · {dc.customerName}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`border-transparent ${
                    dc.settled ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {dc.settled ? t("dcViews.tabCompleted") : t("dcViews.tabPending")}
                </Badge>
              </div>

              {dc.lines.map((line) => (
                <div key={line.key} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{line.component}</p>
                  <p className="text-muted-foreground">
                    {line.material ?? "-"} ·{" "}
                    {t("dcViews.theirDcInline", { refs: line.customerDcNumber })}
                    {line.continues ? ` · ${t("dc.list.continuesEarlier")}` : ""}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {/* A follow-up received nothing; it shows what is pending
                        on the original it continues, as its own page does. */}
                    {line.pending !== null ? (
                      <>
                        <dt className="text-muted-foreground">{t("dc.qty.pending")}</dt>
                        <dd className="text-right tabular-nums">
                          {line.pending}
                          <span className="block text-xs text-muted-foreground">
                            {t("dc.list.onDc", { dc: line.rootDcNumber })}
                          </span>
                        </dd>
                      </>
                    ) : (
                      <>
                        <dt className="text-muted-foreground">{t("dc.qty.received")}</dt>
                        <dd className="text-right tabular-nums">{line.received}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">{t("dc.qty.sent")}</dt>
                    <dd className="text-right tabular-nums">
                      {line.sent}
                      {!line.continues && line.sent !== line.ownSent && (
                        <span className="block text-xs text-muted-foreground">
                          {t("dc.list.onThisDc", { count: line.ownSent })}
                        </span>
                      )}
                    </dd>
                    <dt className="text-muted-foreground">{t("dc.qty.materialProblem")}</dt>
                    <dd className="text-right tabular-nums">{line.materialProblem}</dd>
                    <dt className="text-muted-foreground">{t("dc.qty.rejection")}</dt>
                    <dd className="text-right tabular-nums">{line.rejection}</dd>
                    <dt className="text-muted-foreground">{t("dc.qty.balance")}</dt>
                    <dd
                      className={`text-right tabular-nums ${
                        (line.balance ?? line.after ?? 0) < 0
                          ? "font-medium text-destructive"
                          : (line.balance ?? line.after ?? 0) > 0
                            ? "text-amber-600"
                            : ""
                      }`}
                    >
                      {(line.balance ?? line.after) === null
                        ? "—"
                        : (line.balance ?? line.after ?? 0) < 0
                          ? t("dc.list.extra", { count: -(line.balance ?? line.after ?? 0) })
                          : (line.balance ?? line.after)}
                      {line.onDraft > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("dc.list.onDraft", { count: line.onDraft })}
                        </span>
                      )}
                      {line.continues && line.after !== null && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("dc.list.leftOn", { dc: line.rootDcNumber })}
                        </span>
                      )}
                    </dd>
                  </dl>
                  {line.bookable > 0 && (
                    <Button
                      render={<Link href={`/dashboard/dc/new?from=${line.key}`} />}
                      variant="outline"
                      size="sm"
                      className="mt-2 h-11 w-full"
                    >
                      <FilePlus2 className="h-4 w-4" /> {t("dc.list.createFollowUp")}
                    </Button>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <Button
                  render={<Link href={`/dashboard/dc/${dc.id}`} />}
                  variant="outline"
                  size="sm"
                  className="h-11 flex-1"
                >
                  {t("common.view")}
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/${dc.id}/print`} />}
                  variant="outline"
                  size="sm"
                  className="h-11 w-11"
                  aria-label={t("dc.list.printDc", { dc: dc.dcNumber })}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("dcViews.nothingInTab")}
          </p>
        )}
      </div>
    </div>
  );
}

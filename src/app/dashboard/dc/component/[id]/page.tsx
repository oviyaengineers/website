import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { ComponentPicker } from "@/components/component-picker";
import { fetchComponentLedger, listComponents, type LedgerRow } from "@/lib/component-ledger";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import type { TranslationKey } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("common.component")} | Oviya Engineers` };
}

const STATUS_STYLES: Record<LedgerRow["status"], string> = {
  "pending-scan": "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const STATUS_KEYS: Record<LedgerRow["status"], TranslationKey> = {
  "pending-scan": "search.pendingScan",
  draft: "dc.lifecycle.draft",
  active: "dc.lifecycle.active",
  completed: "dc.lifecycle.completed",
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
  const [ledger, components, { t, lang }] = await Promise.all([
    fetchComponentLedger(id),
    listComponents(),
    getTranslator(),
  ]);
  if (!ledger) notFound();

  const { summary } = ledger;

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={ledger.name} />
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("common.component")}
          </p>
          <h1 className="text-2xl font-semibold">{ledger.name}</h1>
        </div>
        <ComponentPicker components={components} current={ledger.id} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Figure
          label={t("dcHistory.totalReceived")}
          value={summary.received}
          note={t("dcViews.onOurChallans")}
        />
        <Figure label={t("dcHistory.totalSent")} value={summary.sent} />
        <Figure label={t("dc.qty.materialProblem")} value={summary.materialProblem} />
        <Figure label={t("dc.qty.rejection")} value={summary.rejection} />
        <Figure
          label={t("dcViews.currentBalance")}
          value={summary.balance}
          note={t("dcViews.balanceNote")}
        />
      </div>

      {summary.awaitingEntry > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            {summary.pendingScans === 1
              ? t("dcViews.awaitingOne", { qty: summary.awaitingEntry })
              : t("dcViews.awaiting", { qty: summary.awaitingEntry, count: summary.pendingScans })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">
            {ledger.rows.length === 1
              ? t("dcViews.recordsOne")
              : t("dcViews.records", { count: ledger.rows.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="p-3 text-left font-medium">{t("common.date")}</th>
                <th className="p-3 text-left font-medium">{t("common.customer")}</th>
                <th className="p-3 text-left font-medium">{t("dcViews.customerDcNo")}</th>
                <th className="p-3 text-left font-medium">{t("dcViews.ourDcNo")}</th>
                <th className="p-3 text-left font-medium">{t("common.material")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.received")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.sent")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.matProblem")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.rejection")}</th>
                <th className="p-3 text-right font-medium">{t("dc.qty.balance")}</th>
                <th className="p-3 text-left font-medium">{t("common.status")}</th>
                <th className="p-3 text-right font-medium">{t("common.view")}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((row) => (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="p-3 whitespace-nowrap">
                    {row.date ? formatDate(row.date, "dd MMM yyyy", lang) : "-"}
                  </td>
                  <td className="p-3">{row.customerName}</td>
                  <td className="p-3">{row.customerDcNumber}</td>
                  <td className="p-3 font-medium">{row.ourDcNumber ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{row.material ?? "-"}</td>
                  <td className="p-3 text-right tabular-nums">{row.received}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.sent}
                    {row.sent !== row.ownSent && (
                      <span className="block text-xs text-muted-foreground">
                        {t("dc.list.onThisDc", { count: row.ownSent })}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.materialProblem}</td>
                  <td className="p-3 text-right tabular-nums">{row.rejection}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.balance === null
                      ? "—"
                      : row.balance < 0
                        ? t("dc.list.extra", { count: -row.balance })
                        : row.balance}
                    {row.onDraft > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {t("dc.list.onDraft", { count: row.onDraft })}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={`border-transparent ${STATUS_STYLES[row.status]}`}
                    >
                      {t(STATUS_KEYS[row.status])}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button render={<Link href={row.href} />} variant="outline" size="sm">
                      {row.source === "scan" ? t("dcViews.scanButton") : t("dcViews.dcButton")}
                    </Button>
                  </td>
                </tr>
              ))}
              {ledger.rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted-foreground">
                    {t("dcViews.nothingRecorded")}
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

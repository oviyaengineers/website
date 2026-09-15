import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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
import { outwardTotal } from "@/lib/dc-balance";
import { figuresFor, indexChain, isOriginalLine } from "@/lib/dc-chain";
import { withDraftFlags } from "@/lib/dc-chain-data";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("nav.balance")} | Oviya Engineers` };
}

/** How many months of inward/outward history to summarise. */
const MONTHS_SHOWN = 6;

export default async function BalancePage() {
  const supabase = await createClient();

  const [{ data: dcs }, { data: rawItems }, { data: customers }, { t, lang }] = await Promise.all([
    supabase.from("delivery_challans").select("id, dc_number, dc_date, customer_id, status"),
    supabase.from("delivery_challan_items").select("*"),
    supabase.from("customers").select("id, name"),
    getTranslator(),
  ]);
  const monthLabel = (key: string) => formatDate(`${key}-01`, "MMM yyyy", lang);

  const dcMap = new Map((dcs ?? []).map((dc) => [dc.id, dc]));
  const customerMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // Marked draft or not and run through the shared chain calculation, so this
  // page reads the same balance as Dispatched, Stock and the challan itself.
  const items = withDraftFlags(
    rawItems ?? [],
    new Map((dcs ?? []).map((dc) => [dc.id, dc.status]))
  );
  const chain = indexChain(items);

  // One row per lot received. A follow-up line is not a lot of its own: read
  // as one it looked like an over-delivery, and its despatch is already in the
  // balance of the line it continues.
  const rows = items.flatMap((item) => {
    const dc = dcMap.get(item.dc_id);
    if (!dc || !isOriginalLine(item)) return [];
    const line = figuresFor(item, chain);
    return [
      {
        id: item.id,
        dcId: dc.id,
        dcNumber: dc.dc_number,
        dcDate: dc.dc_date,
        customerName: customerMap.get(dc.customer_id) ?? "-",
        component: item.component,
        material: item.material,
        received: line.received,
        outward: line.total,
        balance: line.balance ?? 0,
      },
    ];
  });

  // Inward is booked in the month a lot came in, and outward in the month each
  // despatch went out, which for a follow-up is its own challan's date. A draft
  // follow-up has not gone out, so it is not outward yet.
  const monthly = new Map<string, { inward: number; outward: number }>();
  for (const item of items) {
    const dc = dcMap.get(item.dc_id);
    if (!dc) continue;
    if (!isOriginalLine(item) && item.draft) continue;
    const key = dc.dc_date.slice(0, 7);
    const bucket = monthly.get(key) ?? { inward: 0, outward: 0 };
    bucket.inward += Number(item.received_qty) || 0;
    bucket.outward += outwardTotal(item);
    monthly.set(key, bucket);
  }
  const months = [...monthly.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MONTHS_SHOWN);

  const pending = rows
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.dcDate.localeCompare(a.dcDate));
  const overDelivered = rows
    .filter((row) => row.balance < 0)
    .sort((a, b) => b.dcDate.localeCompare(a.dcDate));

  const totalPending = pending.reduce((sum, row) => sum + row.balance, 0);
  const totalInward = rows.reduce((sum, row) => sum + row.received, 0);
  const totalOutward = rows.reduce((sum, row) => sum + row.outward, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("nav.balance")}</h1>
        <p className="text-sm text-muted-foreground">{t("dcViews.balanceIntro")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dcViews.pendingNotCompleted")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPending.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">
              {pending.length === 1
                ? t("dcViews.piecesAcrossOne")
                : t("dcViews.piecesAcross", { count: pending.length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dcViews.totalInward")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInward.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">{t("dcViews.piecesReceivedAllTime")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dcViews.totalOutward")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalOutward.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">{t("dcViews.outwardNote")}</p>
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
              <p key={row.id}>
                <Link href={`/dashboard/dc/${row.dcId}`} className="underline">
                  {row.dcNumber}
                </Link>{" "}
                — <span className="font-medium">{row.component}</span>
                {t("dcDetail.rowFigures", { received: row.received, outward: row.outward })} —{" "}
                <span className="font-medium">{t("dc.list.extra", { count: -row.balance })}.</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dcViews.monthly")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dcViews.month")}</TableHead>
                  <TableHead className="text-right">{t("dcViews.inward")}</TableHead>
                  <TableHead className="text-right">{t("dcViews.outward")}</TableHead>
                  <TableHead className="text-right">{t("dcViews.difference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map(([key, totals]) => {
                  const difference = totals.inward - totals.outward;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{monthLabel(key)}</TableCell>
                      <TableCell className="text-right">
                        {totals.inward.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {totals.outward.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell
                        className={
                          difference < 0
                            ? "text-right font-medium text-destructive"
                            : difference > 0
                              ? "text-right text-amber-600"
                              : "text-right text-muted-foreground"
                        }
                      >
                        {difference.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {months.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("dcViews.noDcs")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dcViews.notCompleted")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dcViews.dcCol")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.customer")}</TableHead>
                  <TableHead>{t("common.component")}</TableHead>
                  <TableHead>{t("common.material")}</TableHead>
                  <TableHead className="text-right">{t("dc.qty.received")}</TableHead>
                  <TableHead className="text-right">{t("dcViews.outward")}</TableHead>
                  <TableHead className="text-right">{t("dc.qty.balance")}</TableHead>
                  <TableHead className="text-right">{t("dcViews.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.dcNumber}</TableCell>
                    <TableCell>{formatDate(row.dcDate, "dd MMM yyyy", lang)}</TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell>{row.component}</TableCell>
                    <TableCell>{row.material ?? "-"}</TableCell>
                    <TableCell className="text-right">{row.received}</TableCell>
                    <TableCell className="text-right">{row.outward}</TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {row.balance}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Rendering as an anchor, so tell Base UI not to expect
                          a native <button>. */}
                      <Button
                        render={<Link href={`/dashboard/dc/${row.dcId}`} />}
                        nativeButton={false}
                        variant="outline"
                        size="sm"
                      >
                        {t("common.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pending.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      {t("dcViews.nothingPending")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

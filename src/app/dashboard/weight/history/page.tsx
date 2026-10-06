import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeightArchiveFilters } from "@/components/weight-archive-filters";
import { createClient } from "@/lib/supabase/server";
import { indiaToday } from "@/lib/india-date";
import { formatDate } from "@/lib/i18n/dates";
import { formatRupeesFromPaise, formatWeight, formatWeightIn } from "@/lib/weight";
import type { WeightScrapArchiveRow } from "@/types/database";

export const metadata: Metadata = { title: "Scrap History | Oviya Engineers" };

type Filters = { from?: string; to?: string };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function WeightScrapHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const from = filters.from && datePattern.test(filters.from) ? filters.from : "";
  const to = filters.to && datePattern.test(filters.to) ? filters.to : "";
  const supabase = await createClient();
  let query = supabase.from("weight_scrap_archive").select("*");
  if (from) query = query.gte("dc_date", from);
  if (to) query = query.lte("dc_date", to);
  const { data } = await query.order("dc_date", { ascending: false }).order("dc_number", { ascending: false }).order("id", { ascending: false });
  const rows = (data ?? []) as WeightScrapArchiveRow[];
  const sumScrapG = rows.reduce((total, row) => total + Number(row.total_scrap_g), 0);
  const sumValuePaise = rows.reduce((total, row) => total + Math.round(Number(row.scrap_value) * 100), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Archive className="h-5 w-5" /> Scrap History
          </h1>
          <p className="text-sm text-muted-foreground">
            Archived records stay here when you reset Weight / Scrap. Filter by a month or exact dates.
          </p>
        </div>
        <Button render={<Link href="/dashboard/weight" />} variant="outline" className="h-11 sm:h-9">
          <ArrowLeft className="h-4 w-4" /> Weight / Scrap
        </Button>
      </div>

      <WeightArchiveFilters today={indiaToday()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Summary label="Archived lines" value={rows.length.toLocaleString("en-IN")} />
        <Summary label="Total scrap" value={formatWeight(Math.round(sumScrapG * 1000))} />
        <Summary label="Scrap value" value={formatRupeesFromPaise(sumValuePaise)} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No archived scrap records match these dates.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{rows.length} archived {rows.length === 1 ? "line" : "lines"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => <ArchiveCard key={row.id} row={row} />)}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
                    <th>DC Date</th><th>DC No</th><th>Customer</th><th>Component</th><th>Material</th>
                    <th className="text-right">Sent Qty (recorded)</th><th className="text-right">Scrap / pc</th>
                    <th className="text-right">Total scrap</th><th className="text-right">Rate / kg</th>
                    <th className="text-right">Scrap value</th><th>Archived on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b align-top last:border-0 [&_td]:px-2 [&_td]:py-2">
                      <td className="whitespace-nowrap">{formatDate(row.dc_date, "dd MMM yyyy", "en")}</td>
                      <td className="whitespace-nowrap font-medium">{row.dc_number}</td>
                      <td>{row.customer_name}</td><td>{row.component}</td><td>{row.material ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        {qty(row.sent_qty_at_save)}
                        {Number(row.current_sent_qty) !== Number(row.sent_qty_at_save) && (
                          <div className="text-xs text-muted-foreground">current {qty(row.current_sent_qty)}</div>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatWeightIn(row.scrap_weight_g * 1000, row.rough_unit)}
                      </td>
                      <td className="text-right font-medium tabular-nums">{formatWeight(row.total_scrap_g * 1000)}</td>
                      <td className="text-right tabular-nums">{formatRupeesFromPaise(Math.round(row.scrap_rate_per_kg * 100))}</td>
                      <td className="text-right font-medium tabular-nums">{formatRupeesFromPaise(Math.round(row.scrap_value * 100))}</td>
                      <td className="whitespace-nowrap">{formatDate(row.archived_at, "dd MMM yyyy", "en")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function qty(value: number): string {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-xl font-semibold tabular-nums">{value}</p>
    </CardContent></Card>
  );
}

function ArchiveCard({ row }: { row: WeightScrapArchiveRow }) {
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-medium">{row.dc_number} · {formatDate(row.dc_date, "dd MMM yyyy", "en")}</p>
          <p className="text-xs text-muted-foreground">{row.customer_name}</p></div>
        <span className="shrink-0 text-xs text-muted-foreground">Archived {formatDate(row.archived_at, "dd MMM yyyy", "en")}</span>
      </div>
      <p className="break-words font-medium">{row.component}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
        <dt>Material</dt><dd>{row.material ?? "—"}</dd>
        <dt>Sent Qty (recorded)</dt><dd>{qty(row.sent_qty_at_save)}</dd>
        <dt>Scrap / pc</dt><dd>{formatWeightIn(row.scrap_weight_g * 1000, row.rough_unit)}</dd>
        <dt>Total scrap</dt><dd className="font-medium">{formatWeight(row.total_scrap_g * 1000)}</dd>
        <dt>Rate / kg</dt><dd>{formatRupeesFromPaise(Math.round(row.scrap_rate_per_kg * 100))}</dd>
        <dt>Scrap value</dt><dd className="font-medium">{formatRupeesFromPaise(Math.round(row.scrap_value * 100))}</dd>
      </dl>
    </div>
  );
}

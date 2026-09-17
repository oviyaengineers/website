import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Scale, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchBox } from "@/components/search-box";
import { WeightFilters } from "@/components/weight-filters";
import { WeightStatusBadge } from "@/components/weight-status-badge";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { fetchWeightLines } from "@/lib/weight-data";
import {
  filterWeightLines,
  summarizeWeightLines,
  type WeightFilterValues,
  type WeightLine,
} from "@/lib/weight-lines";
import {
  formatRupeesFromPaise,
  formatWeight,
  formatWeightIn,
  NOT_CONFIGURED_TEXT,
  SENT_CHANGED_TEXT,
} from "@/lib/weight";
import { indiaToday } from "@/lib/india-date";
import { formatDate } from "@/lib/i18n/dates";

export const metadata: Metadata = { title: "Weight / Scrap | Oviya Engineers" };

/**
 * Weight / Scrap: every line of every non-draft DC, one row each, with its own
 * Sent Qty. Weights come from the Weight Master; recorded lines show exactly
 * what was recorded. Only reads: recording happens on each DC's weight screen.
 */
export default async function WeightPage({
  searchParams,
}: {
  searchParams: Promise<WeightFilterValues>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();
  const [lines, { data: picklist }, { data: customers }, { profile }] = await Promise.all([
    fetchWeightLines(),
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
    supabase.from("customers").select("name").order("name"),
    getCurrentUserAndProfile(),
  ]);

  const shown = filterWeightLines(lines, filters);
  const totals = summarizeWeightLines(shown);
  const filtered = Object.values(filters).some(Boolean);
  const isAdmin = profile?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Weight / Scrap</h1>
          <p className="text-sm text-muted-foreground">
            Every line of every issued DC. Rough and finished weights come from the Weight/Scrap
            Master; Sent Qty comes from the DC. Open a DC to record its lines.
          </p>
        </div>
        {isAdmin && (
          <Button
            render={<Link href="/dashboard/settings/weight-master" />}
            variant="outline"
            className="h-11 sm:h-9"
          >
            <Settings2 className="h-4 w-4" /> Weight/Scrap Master
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <SearchBox placeholder="Search DC no, customer, component or material" />
        <WeightFilters
          values={filters}
          today={indiaToday()}
          customers={(customers ?? []).map((c) => c.name)}
          components={(picklist ?? []).filter((p) => p.kind === "component").map((p) => p.name)}
          materials={(picklist ?? []).filter((p) => p.kind === "material").map((p) => p.name)}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtered ? "No lines match these filters." : "No issued DC lines yet."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label={shown.length === 1 ? "1 line shown" : `${shown.length} lines shown`}
              value={`${totals.recordedLines} recorded`}
              note={`${totals.pendingLines} pending · ${totals.notConfiguredLines} not configured`}
            />
            <Figure
              label="Recorded Sent Qty"
              value={qty(totals.recordedQty)}
              note={
                totals.sentChangedLines > 0
                  ? `${totals.sentChangedLines} with Sent Qty changed`
                  : "As recorded"
              }
            />
            <Figure label="Total scrap (recorded)" value={formatWeight(totals.totalScrapMg)} />
            <Figure
              label="Scrap value (recorded)"
              value={formatRupeesFromPaise(totals.totalValuePaise)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[#10233f] dark:text-white">
                <Scale className="h-4 w-4" />
                {shown.length === 1 ? "1 line" : `${shown.length} lines`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* A phone gets one card per line; a wider screen the full table. */}
              <div className="space-y-3 md:hidden">
                {shown.map((line) => (
                  <LineCard key={line.itemId} line={line} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
                      <th>Our DC No</th>
                      <th>DC Date</th>
                      <th>Customer</th>
                      <th>Component</th>
                      <th>Material</th>
                      <th className="text-right">Sent Qty</th>
                      <th className="text-right">Rough / pc</th>
                      <th className="text-right">Finished / pc</th>
                      <th className="text-right">Scrap / pc</th>
                      <th className="text-right">Total scrap</th>
                      <th className="text-right">Scrap rate</th>
                      <th className="text-right">Scrap value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((line) => {
                      const cells = lineCells(line);
                      return (
                        <tr
                          key={line.itemId}
                          className="border-b align-top last:border-0 [&_td]:px-2 [&_td]:py-2"
                        >
                          <td className="whitespace-nowrap font-medium">
                            <Link
                              href={`/dashboard/weight/${line.dcId}`}
                              className="text-[#10233f] underline-offset-2 hover:underline dark:text-sky-300"
                            >
                              {line.dcNumber}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap">
                            {formatDate(line.dcDate, "dd MMM yyyy", "en")}
                          </td>
                          <td>{line.customerName}</td>
                          <td>{line.component}</td>
                          <td>{line.material ?? "—"}</td>
                          <td className="text-right tabular-nums">
                            {qty(line.sentQty)}
                            {line.status === "sentChanged" && line.recorded && (
                              <div className="text-xs text-red-700 dark:text-red-300">
                                recorded {qty(line.recorded.sentQty)}
                              </div>
                            )}
                          </td>
                          {line.status === "notConfigured" ? (
                            <td colSpan={6} className="text-amber-800 dark:text-amber-300">
                              {NOT_CONFIGURED_TEXT}
                            </td>
                          ) : (
                            <>
                              <td className="whitespace-nowrap text-right tabular-nums">
                                {cells.rough}
                              </td>
                              <td className="whitespace-nowrap text-right tabular-nums">
                                {cells.finished}
                              </td>
                              <td className="whitespace-nowrap text-right tabular-nums">
                                {cells.scrapPerPiece}
                              </td>
                              <td className="whitespace-nowrap text-right font-medium tabular-nums">
                                {cells.totalScrap}
                              </td>
                              <td className="whitespace-nowrap text-right tabular-nums">
                                {cells.rate}
                              </td>
                              <td className="whitespace-nowrap text-right font-medium tabular-nums">
                                {cells.value}
                              </td>
                            </>
                          )}
                          <td>
                            <WeightStatusBadge status={line.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function qty(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** The weight columns of one line: recorded values, or the master's before recording. */
function lineCells(line: WeightLine) {
  const dash = "—";
  if (line.recorded) {
    const r = line.recorded;
    return {
      rough: formatWeightIn(r.roughMg, r.unit),
      finished: formatWeightIn(r.finishedMg, r.unit),
      scrapPerPiece: formatWeightIn(r.scrapPerPieceMg, r.unit),
      totalScrap: formatWeight(r.totalScrapMg),
      rate: `${formatRupeesFromPaise(r.ratePaisePerKg)} / kg`,
      value: formatRupeesFromPaise(r.valuePaise),
    };
  }
  if (line.master) {
    const m = line.master;
    return {
      rough: formatWeightIn(m.roughMg, m.unit),
      finished: formatWeightIn(m.finishedMg, m.unit),
      scrapPerPiece: formatWeightIn(m.scrapPerPieceMg, m.unit),
      totalScrap: formatWeight(m.totalScrapMg),
      rate: dash,
      value: dash,
    };
  }
  return {
    rough: dash,
    finished: dash,
    scrapPerPiece: dash,
    totalScrap: dash,
    rate: dash,
    value: dash,
  };
}

function LineCard({ line }: { line: WeightLine }) {
  const cells = lineCells(line);
  return (
    <Link
      href={`/dashboard/weight/${line.dcId}`}
      className="block space-y-2 rounded-lg border p-3 text-sm hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[#10233f] dark:text-sky-300">
            {line.dcNumber} · {formatDate(line.dcDate, "dd MMM yyyy", "en")}
          </p>
          <p className="truncate text-xs text-muted-foreground">{line.customerName}</p>
        </div>
        <WeightStatusBadge status={line.status} />
      </div>
      <p className="font-medium break-words">{line.component}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
        <dt>Material</dt>
        <dd>{line.material ?? "—"}</dd>
        <dt>Sent Qty</dt>
        <dd className="font-medium">{qty(line.sentQty)}</dd>
        {line.status !== "notConfigured" && (
          <>
            <dt>Rough / pc</dt>
            <dd>{cells.rough}</dd>
            <dt>Finished / pc</dt>
            <dd>{cells.finished}</dd>
            <dt>Scrap / pc</dt>
            <dd>{cells.scrapPerPiece}</dd>
            <dt>Total scrap</dt>
            <dd className="font-medium">{cells.totalScrap}</dd>
            <dt>Scrap rate</dt>
            <dd>{cells.rate}</dd>
            <dt>Scrap value</dt>
            <dd className="font-medium">{cells.value}</dd>
          </>
        )}
      </dl>
      {line.status === "notConfigured" && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {NOT_CONFIGURED_TEXT}
        </p>
      )}
      {line.status === "sentChanged" && line.recorded && (
        <p className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {SENT_CHANGED_TEXT} Recorded with {qty(line.recorded.sentQty)}.
        </p>
      )}
    </Link>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums break-words">{value}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

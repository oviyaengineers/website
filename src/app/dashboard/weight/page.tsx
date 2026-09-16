import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchBox } from "@/components/search-box";
import { WeightFilters } from "@/components/weight-filters";
import { WeightStatusBadge } from "@/components/weight-status-badge";
import { fetchWeightLines } from "@/lib/weight-data";
import { filterWeightLines, type WeightFilterValues, type WeightLine } from "@/lib/weight-lines";
import {
  formatRupeesFromPaise,
  formatWeight,
  formatWeightIn,
  gramsToMilligrams,
  isWeightUnit,
  storedScrapFigures,
  summarizeWeights,
} from "@/lib/weight";
import { indiaToday } from "@/lib/india-date";
import { formatDate } from "@/lib/i18n/dates";
import { getTranslator } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("weight.title")} | Oviya Engineers` };
}

/**
 * Weight / Scrap: every line of every issued DC, one row each, with its own
 * Sent Qty. Completed DCs are shown first by default. Only reads: weights are
 * entered on the DC's own weight screen.
 */
export default async function WeightPage({
  searchParams,
}: {
  searchParams: Promise<WeightFilterValues>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();
  const [lines, { data: picklist }, { data: customers }, { t, lang }] = await Promise.all([
    fetchWeightLines(),
    supabase.from("dc_picklist_items").select("name, kind").order("name"),
    supabase.from("customers").select("name").order("name"),
    getTranslator(),
  ]);

  const shown = filterWeightLines(lines, filters);
  const totals = summarizeWeights(shown);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("weight.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("weight.intro")}</p>
      </div>

      <div className="space-y-3">
        <SearchBox placeholder={t("weight.searchPlaceholder")} />
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
            {filtered ? t("weight.noLines") : t("weight.noLinesYet")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label={
                shown.length === 1
                  ? t("weight.linesShownOne")
                  : t("weight.linesShown", { count: shown.length })
              }
              value={t("weight.weighedOf", { weighed: totals.weighedLines, total: totals.lines })}
            />
            <Figure label={t("weight.processedQty")} value={qty(totals.processedQty)} />
            <Figure
              label={t("weight.totalScrap")}
              value={formatWeight(totals.totalScrapMg)}
              note={`${t("weight.totalRough")}: ${formatWeight(totals.totalRoughMg)} · ${t("weight.totalFinished")}: ${formatWeight(totals.totalFinishedMg)}`}
            />
            <Figure
              label={t("weight.scrapValue")}
              value={formatRupeesFromPaise(totals.totalValuePaise)}
              note={
                totals.averageRatePaisePerKg !== null
                  ? `${t("weight.valueNote")} · ${t("weight.averageRate", { rate: formatRupeesFromPaise(totals.averageRatePaisePerKg) })}`
                  : t("weight.valueNote")
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[#10233f]">
                <Scale className="h-4 w-4" />
                {shown.length === 1
                  ? t("weight.linesShownOne")
                  : t("weight.linesShown", { count: shown.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* A phone gets one card per line; a wider screen the full table. */}
              <div className="space-y-3 md:hidden">
                {shown.map((line) => (
                  <LineCard key={line.itemId} line={line} t={t} lang={lang} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
                      <th>{t("weight.ourDcNo")}</th>
                      <th>{t("weight.ourDcDate")}</th>
                      <th>{t("common.customer")}</th>
                      <th>{t("weight.customerDcNo")}</th>
                      <th>{t("weight.component")}</th>
                      <th>{t("common.material")}</th>
                      <th className="text-right">{t("weight.sentQty")}</th>
                      <th className="text-right">{t("weight.rough")}</th>
                      <th className="text-right">{t("weight.finished")}</th>
                      <th className="text-right">{t("weight.scrapPerPiece")}</th>
                      <th className="text-right">{t("weight.totalScrap")}</th>
                      <th className="text-right">{t("weight.scrapRate")}</th>
                      <th className="text-right">{t("weight.scrapValue")}</th>
                      <th>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((line) => {
                      const cells = lineCells(line, t);
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
                            {line.followUpOf && (
                              <div className="text-xs font-normal text-muted-foreground">
                                {t("weight.followUpOf", { dc: line.followUpOf })}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {formatDate(line.dcDate, "dd MMM yyyy", lang)}
                          </td>
                          <td>{line.customerName}</td>
                          <td>{line.customerDcNumbers.join(", ") || "—"}</td>
                          <td>{line.component}</td>
                          <td>{line.material ?? "—"}</td>
                          <td className="text-right tabular-nums">{qty(line.sentQty)}</td>
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

/** The weight columns of one line, or dashes where nothing is recorded. */
function lineCells(line: WeightLine, t: Translate) {
  const dash = t("weight.notEntered");
  const w = line.weight;
  if (!w) {
    return {
      rough: dash,
      finished: dash,
      scrapPerPiece: dash,
      totalScrap: dash,
      rate: dash,
      value: dash,
    };
  }
  const figures = storedScrapFigures(w, line.sentQty);
  const roughUnit = isWeightUnit(w.rough_unit) ? w.rough_unit : "g";
  const finishedUnit = isWeightUnit(w.finished_unit) ? w.finished_unit : "g";
  return {
    rough: `${formatWeightIn(gramsToMilligrams(w.rough_weight_g), roughUnit)} ${t("weight.perPiece")}`,
    finished: `${formatWeightIn(gramsToMilligrams(w.finished_weight_g), finishedUnit)} ${t("weight.perPiece")}`,
    scrapPerPiece: `${formatWeight(figures.scrapPerPieceMg)} ${t("weight.perPiece")}`,
    totalScrap: formatWeight(figures.totalScrapMg),
    rate:
      figures.ratePaisePerKg === null
        ? dash
        : `${formatRupeesFromPaise(figures.ratePaisePerKg)} / kg`,
    value: figures.totalValuePaise === null ? dash : formatRupeesFromPaise(figures.totalValuePaise),
  };
}

function LineCard({ line, t, lang }: { line: WeightLine; t: Translate; lang: Lang }) {
  const cells = lineCells(line, t);
  return (
    <Link
      href={`/dashboard/weight/${line.dcId}`}
      className="block space-y-2 rounded-lg border p-3 text-sm hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[#10233f] dark:text-sky-300">
            {line.dcNumber} · {formatDate(line.dcDate, "dd MMM yyyy", lang)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {line.customerName}
            {line.customerDcNumbers.length > 0 ? ` · ${line.customerDcNumbers.join(", ")}` : ""}
          </p>
        </div>
        <WeightStatusBadge status={line.status} />
      </div>
      <p className="font-medium break-words">{line.component}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
        <dt>{t("common.material")}</dt>
        <dd>{line.material ?? "—"}</dd>
        <dt>{t("weight.sentQty")}</dt>
        <dd className="font-medium">{qty(line.sentQty)}</dd>
        <dt>{t("weight.roughShort")}</dt>
        <dd>{cells.rough}</dd>
        <dt>{t("weight.finishedShort")}</dt>
        <dd>{cells.finished}</dd>
        <dt>{t("weight.scrapPerPieceShort")}</dt>
        <dd>{cells.scrapPerPiece}</dd>
        <dt>{t("weight.totalScrap")}</dt>
        <dd className="font-medium">{cells.totalScrap}</dd>
        <dt>{t("weight.scrapRate")}</dt>
        <dd>{cells.rate}</dd>
        <dt>{t("weight.scrapValue")}</dt>
        <dd className="font-medium">{cells.value}</dd>
      </dl>
      {line.followUpOf && (
        <p className="text-xs text-muted-foreground">
          {t("weight.followUpOf", { dc: line.followUpOf })}
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { combinedLayoutOptions, MAX_FULL_LINES } from "@/lib/dc-combined-print";

export type PickerDc = {
  id: string;
  dcNumber: string;
  /** Already formatted in the chosen language. */
  dcDate: string;
  customerDcNumbers: string[];
  statusLabel: string;
  lines: { id: string; component: string; material: string | null; sentQty: number }[];
  /** Lines that would be printed: something sent, returned or rejected. */
  printableLines: number;
};

/**
 * The DCs of one customer on one Our DC Date, to tick for a combined print.
 *
 * Nothing starts ticked: the operator chooses. Select All only takes DCs that
 * have something to print. Long selections are printed on full pages, chosen
 * on the print screen; only a selection too long even for that is refused.
 */
export function CombinedDcPicker({ dcs }: { dcs: PickerDc[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);

  const printable = dcs.filter((dc) => dc.printableLines > 0);
  const chosen = dcs.filter((dc) => selected.includes(dc.id));
  const lineCount = chosen.reduce((total, dc) => total + dc.printableLines, 0);
  const options = combinedLayoutOptions(lineCount);

  function toggle(id: string, on: boolean) {
    setSelected((ids) => (on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)));
  }

  const href =
    chosen.length === 1
      ? `/dashboard/dc/${chosen[0].id}/print`
      : `/dashboard/dc/combined-print/print?ids=${chosen.map((dc) => dc.id).join(",")}`;
  const canPrint = chosen.length > 0 && lineCount > 0 && options.fullFits;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelected(printable.map((dc) => dc.id))}
          disabled={printable.length === 0}
        >
          {t("dcCombined.selectAll")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelected([])}
          disabled={selected.length === 0}
        >
          {t("dcCombined.clearAll")}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {t("dcCombined.selectedSummary", { dcs: chosen.length, lines: lineCount })}
        </span>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 font-medium">{t("dcCombined.ourDcNo")}</th>
                <th className="px-3 py-2 font-medium">{t("dcCombined.ourDcDate")}</th>
                <th className="px-3 py-2 font-medium">{t("dcCombined.customerDcNo")}</th>
                <th className="px-3 py-2 font-medium">{t("dcCombined.component")}</th>
                <th className="px-3 py-2 font-medium">{t("dcCombined.material")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("dcCombined.sentQty")}</th>
                <th className="px-3 py-2 font-medium">{t("dcCombined.status")}</th>
              </tr>
            </thead>
            <tbody>
              {dcs.map((dc) => {
                const disabled = dc.printableLines === 0;
                const checked = selected.includes(dc.id);
                return (
                  <tr
                    key={dc.id}
                    className={`border-t align-top ${checked ? "bg-sky-50/70" : ""} ${disabled ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#10233f]"
                        aria-label={t("dcCombined.select", { dc: dc.dcNumber })}
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => toggle(dc.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <Link href={`/dashboard/dc/${dc.id}`} className="hover:underline">
                        {dc.dcNumber}
                      </Link>
                      {disabled && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("dcCombined.nothingToPrint")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{dc.dcDate}</td>
                    <td className="px-3 py-2">{dc.customerDcNumbers.join(", ") || "-"}</td>
                    <td className="px-3 py-2">
                      {dc.lines.map((line) => (
                        <span key={line.id} className="block">
                          {line.component}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      {dc.lines.map((line) => (
                        <span key={line.id} className="block">
                          {line.material ?? "-"}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {dc.lines.map((line) => (
                        <span key={line.id} className="block">
                          {line.sentQty}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{dc.statusLabel}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {!options.fullFits ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("dcCombined.tooManyForPrint", { lines: lineCount, max: MAX_FULL_LINES })}
        </p>
      ) : options.choose ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t("dcCombined.longSelectionNote")}
        </p>
      ) : null}

      {canPrint ? (
        <Button
          render={<Link href={href} />}
          className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9 sm:w-auto"
        >
          <Printer className="h-4 w-4" />{" "}
          {chosen.length === 1 ? t("dcCombined.printSingle") : t("dcCombined.printCombined")}
        </Button>
      ) : (
        <Button disabled className="h-11 w-full sm:h-9 sm:w-auto">
          <Printer className="h-4 w-4" /> {t("dcCombined.printCombined")}
        </Button>
      )}
    </div>
  );
}

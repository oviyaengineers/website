"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n/dates";
import type { Lang } from "@/lib/i18n/config";
import type { DcRow } from "@/lib/dc-rows";

function shortDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDate(value, "dd MMM yyyy", lang);
}

/**
 * The item lines, with both sides of the movement on one row.
 *
 * A wide table is unreadable on a phone, so below the small breakpoint each
 * line is stacked as a card instead. Both are rendered and one is hidden, which
 * keeps it working without measuring the viewport in JavaScript.
 */
export function DcRowTable({ rows, showPending }: { rows: DcRow[]; showPending: boolean }) {
  const { t, lang } = useI18n();
  const date = (value: string | null | undefined) => shortDate(value, lang);
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("dc.cols.customerDc")}</TableHead>
              <TableHead>{t("dc.cols.description")}</TableHead>
              <TableHead className="text-right">{t("dc.qty.recd")}</TableHead>
              <TableHead>{t("dc.cols.ourDc")}</TableHead>
              <TableHead className="text-right">{t("dc.qty.sent")}</TableHead>
              <TableHead className="text-right">{t("dc.qty.materialProblem")}</TableHead>
              <TableHead className="text-right">{t("dc.qty.rejection")}</TableHead>
              {showPending && <TableHead className="text-right">{t("dc.qty.pending")}</TableHead>}
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="align-top">
                  <span className="font-medium">{row.customerDcNumbers.join(", ") || "-"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.customerDcDates.map(date).join(", ") || "-"}
                  </span>
                  <span className="block text-xs text-muted-foreground">{row.customerName}</span>
                </TableCell>
                <TableCell className="align-top">
                  {row.component}
                  {row.material ? (
                    <span className="block text-xs text-muted-foreground">{row.material}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.received}</TableCell>
                <TableCell className="align-top">
                  <Link
                    href={`/dashboard/dc/${row.dcId}`}
                    className="font-medium text-[#10233f] underline-offset-2 hover:underline dark:text-amber-400"
                  >
                    {row.dcNumber}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{date(row.dcDate)}</span>
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.sent}</TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {row.materialProblem}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.rejection}</TableCell>
                {showPending && (
                  <TableCell className="text-right align-top font-medium tabular-nums">
                    {row.pending}
                  </TableCell>
                )}
                <TableCell className="space-x-2 text-right align-top whitespace-nowrap">
                  <Button
                    render={<Link href={`/dashboard/dc/${row.dcId}`} />}
                    variant="outline"
                    size="sm"
                  >
                    {t("common.view")}
                  </Button>
                  <Button
                    render={<Link href={`/dashboard/dc/${row.dcId}/print`} />}
                    variant="outline"
                    size="sm"
                    aria-label={t("dc.list.printDc", { dc: row.dcNumber })}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{row.component}</p>
            {row.material ? <p className="text-xs text-muted-foreground">{row.material}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {row.customerDcNumbers.join(", ") || "-"} ·{" "}
              {row.customerDcDates.map(date).join(", ") || "-"}
            </p>
            <p className="text-xs text-muted-foreground">{row.customerName}</p>
            <p className="mt-1 text-xs">
              <Link
                href={`/dashboard/dc/${row.dcId}`}
                className="font-medium text-[#10233f] underline-offset-2 hover:underline dark:text-amber-400"
              >
                {row.dcNumber}
              </Link>{" "}
              <span className="text-muted-foreground">· {date(row.dcDate)}</span>
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Figure label={t("dc.qty.received")} value={row.received} />
              <Figure label={t("dc.qty.sent")} value={row.sent} />
              <Figure label={t("dc.qty.materialProblem")} value={row.materialProblem} />
              <Figure label={t("dc.qty.rejection")} value={row.rejection} />
              {showPending && <Figure label={t("dc.qty.pending")} value={row.pending} strong />}
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                render={<Link href={`/dashboard/dc/${row.dcId}`} />}
                variant="outline"
                size="sm"
                className="h-11 flex-1"
              >
                {t("common.view")}
              </Button>
              <Button
                render={<Link href={`/dashboard/dc/${row.dcId}/print`} />}
                variant="outline"
                size="sm"
                className="h-11 w-11"
                aria-label={t("dc.list.printDc", { dc: row.dcNumber })}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums${strong ? " font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

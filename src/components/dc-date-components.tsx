"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findCustomerDcRefs, type StoredDcItem, type StoredDcMatch } from "@/lib/actions/dc-lookup";
import { balanceQty } from "@/lib/dc-balance";
import { formatDcDate } from "@/components/dc-ref-lookup";

/** Wait this long after the date changes before querying. */
const DEBOUNCE_MS = 250;

export type DateComponentPick = {
  component: string;
  material: string | null;
  received_qty: number;
};

/** A row still owing pieces. */
type PendingRow = { item: StoredDcItem; pending: number };

/** One stored challan on the chosen date, with only its unfinished rows. */
type DateGroup = {
  match: StoredDcMatch;
  refNumbers: string[];
  rows: PendingRow[];
};

/**
 * The challans still owing work on one customer DC date.
 *
 * Only unfinished rows are listed. A challan whose pieces have all gone back is
 * settled and says nothing useful while a new one is being raised; what matters
 * is what is still outstanding on that date. Same reckoning as the balance
 * page: received minus sent, material problem and rejection.
 *
 * Read-only apart from the fill button, which only populates form state.
 */
export function DcDateComponents({
  customerId,
  date,
  excludeDcId,
  onFill,
}: {
  customerId: string;
  date: string;
  excludeDcId?: string | null;
  onFill: (items: DateComponentPick[], sourceLabel: string) => void;
}) {
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // State writes live in the callback so changing the date does not set state
    // straight from the effect body on each keystroke.
    const timer = setTimeout(async () => {
      if (!customerId || !date.trim()) {
        if (!cancelled) {
          setGroups([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);
      try {
        const options = await findCustomerDcRefs({ customerId, date, excludeDcId });

        // Several references can cite the same stored challan; collapse them so
        // its rows are listed once, tagged with every reference.
        const byDc = new Map<string, DateGroup>();
        for (const option of options) {
          const existing = byDc.get(option.match.id);
          if (existing) {
            if (!existing.refNumbers.includes(option.number)) {
              existing.refNumbers.push(option.number);
            }
            continue;
          }
          const rows = option.match.items
            .map((item) => ({ item, pending: balanceQty(item) }))
            .filter((row) => row.pending > 0);
          byDc.set(option.match.id, { match: option.match, refNumbers: [option.number], rows });
        }

        // A challan with nothing outstanding is finished, so it is not listed.
        const unfinished = [...byDc.values()].filter((group) => group.rows.length > 0);
        if (!cancelled) setGroups(unfinished);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerId, date, excludeDcId]);

  if (!customerId || !date.trim()) return null;

  if (loading && groups.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking what is still pending on {formatDcDate(date)}…
      </p>
    );
  }

  if (groups.length === 0) return null;

  const rows = groups.flatMap((group) => group.rows);
  const totalPending = rows.reduce((sum, row) => sum + row.pending, 0);

  // The outstanding count is what a new challan is for, so that is the figure
  // carried over rather than the original received quantity.
  const fillAll = () =>
    onFill(
      rows.map((row) => ({
        component: row.item.component,
        material: row.item.material,
        received_qty: row.pending,
      })),
      formatDcDate(date)
    );

  return (
    <div className="overflow-hidden rounded-md border border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 px-3 py-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
            <ClipboardList className="h-3.5 w-3.5" />
            {totalPending} pending on {formatDcDate(date)}
          </h4>
          <p className="text-[11px] text-muted-foreground">
            {rows.length} unfinished row{rows.length === 1 ? "" : "s"} across {groups.length}{" "}
            challan
            {groups.length === 1 ? "" : "s"}. Settled challans are not listed.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={fillAll}>
          Fill all {rows.length}
        </Button>
      </div>

      <div className="divide-y">
        {groups.map((group) => (
          <div key={group.match.id} className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {group.refNumbers.join(", ") || "-"}
              </span>{" "}
              · {group.match.dc_number} · {formatDcDate(group.match.dc_date)}
            </p>

            <table className="mt-1 w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="py-0.5 font-medium">Component</th>
                  <th className="w-12 py-0.5 pl-2 text-right font-medium">Recd</th>
                  <th className="w-12 py-0.5 pl-2 text-right font-medium">Done</th>
                  <th className="w-14 py-0.5 pl-2 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-0.5 pr-2">
                      {row.item.component}
                      {row.item.material ? (
                        <span className="text-muted-foreground"> · {row.item.material}</span>
                      ) : null}
                    </td>
                    <td className="py-0.5 pl-2 text-right tabular-nums">{row.item.received_qty}</td>
                    <td className="py-0.5 pl-2 text-right tabular-nums">
                      {row.item.received_qty - row.pending}
                    </td>
                    <td className="py-0.5 pl-2 text-right font-medium tabular-nums">
                      {row.pending}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="border-t border-amber-500/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        Pending is received minus sent, material problem and rejection. Filling copies the pending
        count; sent, material problem and rejection stay at zero for you to enter. Nothing is saved
        until you submit this form.
      </p>
    </div>
  );
}

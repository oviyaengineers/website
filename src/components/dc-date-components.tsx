"use client";

import { useEffect, useState } from "react";
import { Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findCustomerDcRefs, type StoredDcItem, type StoredDcMatch } from "@/lib/actions/dc-lookup";
import { formatDcDate } from "@/components/dc-ref-lookup";

/** Wait this long after the date changes before querying. */
const DEBOUNCE_MS = 250;

export type DateComponentPick = {
  component: string;
  material: string | null;
  received_qty: number;
};

/** One stored challan on the chosen date, with the references pointing at it. */
type DateGroup = {
  match: StoredDcMatch;
  refNumbers: string[];
};

/**
 * Every component recorded against a customer on one customer DC date.
 *
 * The picker beside the field lists references and hides their contents behind
 * a "Details" toggle, which means a date carrying several challans has to be
 * opened one at a time. Here the whole day is laid out at once — a customer
 * often sends one date's goods across more than one challan, and the operator
 * needs to see every component before deciding what this outward challan
 * covers.
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

    // Every state write sits in this callback, so typing a date does not set
    // state straight from the effect body on each keystroke.
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
        // its components are listed once, tagged with every reference.
        const byDc = new Map<string, DateGroup>();
        for (const option of options) {
          const existing = byDc.get(option.match.id);
          if (existing) {
            if (!existing.refNumbers.includes(option.number)) {
              existing.refNumbers.push(option.number);
            }
          } else {
            byDc.set(option.match.id, { match: option.match, refNumbers: [option.number] });
          }
        }
        if (!cancelled) setGroups([...byDc.values()]);
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
      <p className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Looking up components for {formatDcDate(date)}…
      </p>
    );
  }

  if (groups.length === 0) return null;

  const allItems: StoredDcItem[] = groups.flatMap((group) => group.match.items);
  if (allItems.length === 0) return null;

  const fillAll = () =>
    onFill(
      allItems.map((item) => ({
        component: item.component,
        material: item.material,
        received_qty: item.received_qty,
      })),
      formatDcDate(date)
    );

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-xs font-medium">
            <PackageSearch className="h-3.5 w-3.5" />
            {allItems.length} component{allItems.length === 1 ? "" : "s"} on file for{" "}
            {formatDcDate(date)}
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Across {groups.length} stored challan{groups.length === 1 ? "" : "s"} for this customer.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={fillAll}>
          Fill all {allItems.length}
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

            {group.match.items.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No components recorded.</p>
            ) : (
              <table className="mt-1 w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="py-0.5 font-medium">Component</th>
                    <th className="w-12 py-0.5 pl-2 text-right font-medium">Recd</th>
                    <th className="w-12 py-0.5 pl-2 text-right font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {group.match.items.map((item, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-0.5 pr-2">
                        {item.component}
                        {item.material ? (
                          <span className="text-muted-foreground"> · {item.material}</span>
                        ) : null}
                      </td>
                      <td className="py-0.5 pl-2 text-right tabular-nums">{item.received_qty}</td>
                      <td className="py-0.5 pl-2 text-right tabular-nums">{item.sent_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        Received quantities are copied; sent, material problem and rejection stay at zero for you to
        enter. Nothing is saved until you submit this form.
      </p>
    </div>
  );
}

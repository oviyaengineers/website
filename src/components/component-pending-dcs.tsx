"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { findPendingDcsForComponent, type PendingComponentDc } from "@/lib/actions/dc-lookup";
import { formatDcDate } from "@/components/dc-ref-lookup";

/** Wait this long after the selection changes before querying. */
const DEBOUNCE_MS = 200;

/**
 * The challans still holding pieces of the selected component.
 *
 * Pending means the balance, not the status: received minus everything
 * accounted for back to the customer. Choosing a part on a new challan is
 * exactly when the operator needs to see what is already outstanding on it,
 * so the list appears on selection rather than behind a button.
 *
 * Read-only — it never touches the row it sits under.
 */
export function ComponentPendingDcs({
  component,
  excludeDcId,
}: {
  component: string;
  excludeDcId?: string | null;
}) {
  const [rows, setRows] = useState<PendingComponentDc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // State writes live in the callback so changing the select does not set
    // state straight from the effect body.
    const timer = setTimeout(async () => {
      if (!component.trim()) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const found = await findPendingDcsForComponent({ component, excludeDcId });
        if (!cancelled) setRows(found);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [component, excludeDcId]);

  if (!component.trim()) return null;

  if (loading && rows.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking pending challans…
      </p>
    );
  }

  if (rows.length === 0) return null;

  const totalPending = rows.reduce((sum, row) => sum + row.pending_qty, 0);

  return (
    <div className="overflow-hidden rounded-md border border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/20">
      <div className="border-b border-amber-500/40 px-2 py-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
          <ClipboardList className="h-3.5 w-3.5" />
          {totalPending} pending on {rows.length} challan{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="px-2 py-0.5 font-medium">DC</th>
            <th className="px-2 py-0.5 font-medium">Date</th>
            <th className="w-12 px-2 py-0.5 text-right font-medium">Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.id}-${row.material ?? ""}-${i}`} className="align-top">
              <td className="px-2 py-0.5">
                <span className="font-medium">{row.dc_number}</span>
                {row.material ? (
                  <span className="text-muted-foreground"> · {row.material}</span>
                ) : null}
                {row.customer_name ? (
                  <span className="block text-muted-foreground">{row.customer_name}</span>
                ) : null}
              </td>
              <td className="px-2 py-0.5 whitespace-nowrap">{formatDcDate(row.dc_date)}</td>
              <td className="px-2 py-0.5 text-right font-medium tabular-nums">{row.pending_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-amber-500/40 px-2 py-1 text-[11px] text-muted-foreground">
        Received minus sent, material problem and rejection. Read-only.
      </p>
    </div>
  );
}

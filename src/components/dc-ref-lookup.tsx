"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { FileSearch, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findDcsByCustomerRef, type StoredDcMatch } from "@/lib/actions/dc-lookup";

/** Wait this long after the last keystroke before querying. */
const DEBOUNCE_MS = 450;

export function formatDcDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

/**
 * Renders stored challans. Shared by the DC-number field lookup and the
 * scanner's review step so both present a match the same way.
 */
export function StoredDcMatchList({ matches }: { matches: StoredDcMatch[] }) {
  return (
    <div className="divide-y">
      {matches.map((match) => (
        <div key={match.id} className="space-y-1.5 px-3 py-2.5 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{match.dc_number}</span>
            <span className="capitalize text-muted-foreground">{match.status}</span>
          </div>
          <p className="text-muted-foreground">
            {formatDcDate(match.dc_date)} · {match.customer_name ?? "-"}
          </p>
          <p className="text-muted-foreground">
            Customer DC: {match.customer_dc_number?.filter(Boolean).join(", ") || "-"}
          </p>

          {match.items.length === 0 ? (
            <p className="text-muted-foreground">No items recorded.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="py-0.5 font-medium">Component</th>
                  <th className="w-10 py-0.5 pl-2 text-right font-medium">Recd</th>
                  <th className="w-10 py-0.5 pl-2 text-right font-medium">Sent</th>
                  <th className="w-10 py-0.5 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {match.items.map((item, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-0.5 pr-2">
                      {item.component}
                      {item.material ? (
                        <span className="text-muted-foreground"> · {item.material}</span>
                      ) : null}
                    </td>
                    <td className="py-0.5 pl-2 text-right tabular-nums">{item.received_qty}</td>
                    <td className="py-0.5 pl-2 text-right tabular-nums">{item.sent_qty}</td>
                    <td className="py-0.5 pl-2 text-right tabular-nums">{item.total_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Shows what is already stored against a customer DC number / date, as soon as
 * a match is found.
 *
 * Purely a reader: it never writes and never edits the row being typed into.
 * The panel is plain absolute positioning rather than a Popover on purpose —
 * a Popover moves focus to itself, which would interrupt typing. This one
 * appears beside the field and leaves the caret where it is.
 */
export function DcRefLookup({
  number,
  date,
  excludeDcId,
}: {
  number: string;
  date: string;
  excludeDcId?: string | null;
}) {
  const [matches, setMatches] = useState<StoredDcMatch[]>([]);
  const [loading, setLoading] = useState(false);
  /** Which reference the operator has dismissed, so it does not keep popping back. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  }>({ top: 0, right: 0, maxHeight: 320 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const queryKey = `${number.trim()}|${date.trim()}`;

  useEffect(() => {
    let cancelled = false;

    // Every state write happens inside this callback rather than the effect
    // body, so typing does not trigger a render cascade.
    const timer = setTimeout(async () => {
      if (!number.trim() && !date.trim()) {
        if (!cancelled) {
          setMatches([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);
      try {
        const found = await findDcsByCustomerRef({ number, date, excludeDcId });
        if (!cancelled) setMatches(found);
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [number, date, excludeDcId]);

  // createPortal needs a DOM, so it only runs after the client takes over.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the panel pinned under its trigger as the page scrolls or resizes.
  useEffect(() => {
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Anchored to the trigger's right edge, but never so far right that the
      // panel's own left edge leaves the screen — on a phone the trigger sits
      // close enough to the edge for that to push the panel off.
      const panelWidth = Math.min(22 * 16, window.innerWidth - 32);
      const right = Math.min(
        Math.max(8, window.innerWidth - rect.right),
        Math.max(8, window.innerWidth - panelWidth - 8)
      );
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;

      // Anchor below when there is room, otherwise flip above — using `bottom`
      // for the flipped case so the panel's own height need not be known.
      if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
        setPos({ top: rect.bottom + 4, right, maxHeight: Math.max(140, spaceBelow) });
      } else {
        setPos({
          bottom: window.innerHeight - rect.top + 4,
          right,
          maxHeight: Math.max(140, spaceAbove),
        });
      }
    };
    const raf = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [matches.length, dismissed]);

  if (loading && matches.length === 0) {
    return (
      <span className="flex h-11 w-11 items-center justify-center text-muted-foreground md:h-8 md:w-8">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }

  if (matches.length === 0) return null;

  // Shown automatically; the toggle only matters after an explicit dismiss.
  const open = dismissed !== queryKey;

  const panel = (
    <div
      role="dialog"
      aria-label="Stored delivery challan details"
      style={{
        position: "fixed",
        top: pos.top,
        bottom: pos.bottom,
        right: pos.right,
        maxHeight: pos.maxHeight,
      }}
      className="z-50 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      <div className="flex items-start justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <div>
          <p className="text-sm font-medium">
            {matches.length} stored delivery challan{matches.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">
            Already recorded against {number.trim() ? `“${number.trim()}”` : "this date"}
            {number.trim() && date.trim() ? ` on ${formatDcDate(date)}` : ""}.
          </p>
        </div>
        <button
          type="button"
          aria-label="Hide stored challan details"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(queryKey)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <StoredDcMatchList matches={matches} />

      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Read-only. Nothing here changes the stored challans.
      </p>
    </div>
  );

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="icon"
        className="size-11 border-amber-500 text-amber-700 md:size-8"
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${matches.length} stored delivery challan${
          matches.length === 1 ? "" : "s"
        } for this reference`}
        onClick={() => setDismissed(open ? queryKey : null)}
      >
        <FileSearch className="h-4 w-4" />
      </Button>
      {/* Portalled: the surrounding Card clips overflow, which would cut the
          panel off. A portal also avoids the focus move a Popover performs. */}
      {open && mounted ? createPortal(panel, document.body) : null}
    </>
  );
}

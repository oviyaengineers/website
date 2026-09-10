"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mergePicklistItemsAction, type DuplicateEntry } from "@/lib/actions/dc-picklists";
import type { DcPicklistKind } from "@/types/database";

/**
 * Offers to collapse entries that look like the same part spelled differently.
 *
 * Scanning creates these: a zero read as a letter O, "Flg" as "Fig". Each
 * variant becomes its own dropdown entry, and the wrong one gets picked sooner
 * or later. Merging keeps one spelling and moves any challan rows onto it, so
 * nothing is left pointing at a name the dropdown no longer offers.
 *
 * Nothing is merged without a choice: these are suggestions, and two genuinely
 * different parts can look alike when they differ by one character.
 */
export function DuplicatePicklistGroups({
  kind,
  groups,
}: {
  kind: DcPicklistKind;
  groups: DuplicateEntry[][];
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = groups.filter((group) => !dismissed.includes(group[0].id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <Copy className="h-4 w-4" />
          {visible.length} possible duplicate{visible.length === 1 ? "" : " sets"} in this list
        </h2>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
          These read as the same {kind} spelled differently. Keep the correct spelling and the rest
          are removed, with any challan rows moved across. Check each one — two genuinely different
          parts can differ by a single character.
        </p>
      </div>

      {visible.map((group) => (
        <DuplicateGroup
          key={group[0].id}
          kind={kind}
          group={group}
          onDone={() => setDismissed((ids) => [...ids, group[0].id])}
        />
      ))}
    </div>
  );
}

function DuplicateGroup({
  kind,
  group,
  onDone,
}: {
  kind: DcPicklistKind;
  group: DuplicateEntry[];
  onDone: () => void;
}) {
  // Defaults to the most-used spelling, which is usually the right one.
  const [keepId, setKeepId] = useState(group[0].id);
  const [pending, startTransition] = useTransition();

  function merge() {
    const dropIds = group.filter((entry) => entry.id !== keepId).map((entry) => entry.id);
    startTransition(async () => {
      const result = await mergePicklistItemsAction(kind, keepId, dropIds);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDone();
      toast.success(
        result.movedRows > 0
          ? `Removed ${result.removed}, and moved ${result.movedRows} challan row${
              result.movedRows === 1 ? "" : "s"
            } onto the kept spelling.`
          : `Removed ${result.removed} duplicate${result.removed === 1 ? "" : "s"}.`
      );
    });
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      {group.map((entry) => (
        <label key={entry.id} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={`keep-${group[0].id}`}
            className="mt-1 h-4 w-4 accent-[#10233f]"
            checked={keepId === entry.id}
            disabled={pending}
            onChange={() => setKeepId(entry.id)}
          />
          <span className="min-w-0 flex-1">
            <span className="break-all font-mono text-xs">{entry.name}</span>
            <span className="block text-[11px] text-muted-foreground">
              {entry.usedOnRows === 0
                ? "not used on any challan"
                : `used on ${entry.usedOnRows} challan row${entry.usedOnRows === 1 ? "" : "s"}`}
            </span>
          </span>
        </label>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={merge}
          className="bg-[#10233f] hover:bg-[#10233f]/90"
        >
          {pending ? "Merging…" : `Keep this, remove ${group.length - 1}`}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Not duplicates
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addUnlistedDcNamesAction } from "@/lib/actions/dc-picklists";

/**
 * Offers the names used on stored challans that the picklist is missing.
 *
 * They are listed before anything is written, so it is clear exactly what
 * would be added; adding is one insert of everything shown.
 */
export function ImportUnlistedNames({
  components,
  materials,
}: {
  components: string[];
  materials: string[];
}) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const total = components.length + materials.length;

  if (total === 0 || done) return null;

  function add() {
    startTransition(async () => {
      const result = await addUnlistedDcNamesAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success(`Added ${result.added} name${result.added === 1 ? "" : "s"} to the dropdowns.`);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
      <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {total} name{total === 1 ? "" : "s"} used on challans but missing from these lists
      </h2>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
        These are recorded on stored challans, so they cannot be picked on a new one until they are
        added here. Nothing already listed is touched and nothing is duplicated.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[...components, ...materials].map((name) => (
          <span key={name} className="rounded-full border bg-background px-2 py-0.5 text-xs">
            {name}
          </span>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={add}
        className="bg-[#10233f] hover:bg-[#10233f]/90"
      >
        <Download className="h-4 w-4" />
        {pending ? "Adding…" : `Add all ${total}`}
      </Button>
    </div>
  );
}

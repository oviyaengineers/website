"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
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
  const { t } = useI18n();
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
      toast.success(
        result.added === 1 ? t("settings.addedOne") : t("settings.added", { count: result.added })
      );
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
      <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {total === 1 ? t("settings.missingOne") : t("settings.missing", { count: total })}
      </h2>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
        {t("settings.missingNote")}
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
        {pending ? t("settings.adding") : t("settings.addAll", { count: total })}
      </Button>
    </div>
  );
}

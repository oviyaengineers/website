"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { updateDcStatusAction } from "@/lib/actions/dc";
import type { DcLifecycle } from "@/lib/dc-lifecycle";

/**
 * The only status moves anyone makes by hand.
 *
 * Completion is not one of them: a challan is complete when every piece
 * received has been accounted for, which is read off the item rows. The
 * buttons here put a challan on the books, or take a finished one back off
 * them so it can be corrected.
 */
export function DcStatusActions({ id, lifecycle }: { id: string; lifecycle: DcLifecycle }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function move(to: "draft" | "active", done: string) {
    startTransition(async () => {
      try {
        await updateDcStatusAction(id, to);
        toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("dc.statusActions.couldNotChange"));
      }
    });
  }

  if (lifecycle === "draft") {
    return (
      <Button disabled={pending} onClick={() => move("active", t("dc.statusActions.nowActive"))}>
        <Send className="h-4 w-4" />
        {pending ? t("dc.statusActions.working") : t("dc.statusActions.confirm")}
      </Button>
    );
  }

  if (lifecycle === "completed") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {t("dc.statusActions.reconciled")}
        </span>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => move("draft", t("dc.statusActions.reopened"))}
        >
          <RotateCcw className="h-4 w-4" />
          {pending ? t("dc.statusActions.working") : t("dc.statusActions.reopen")}
        </Button>
      </div>
    );
  }

  return null;
}

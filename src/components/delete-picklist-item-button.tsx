"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n-provider";
import { countPicklistNameUsage, deletePicklistItemAction } from "@/lib/actions/dc-picklists";
import type { DcPicklistKind } from "@/types/database";

/**
 * Removes one dropdown entry, behind a confirmation.
 *
 * It used to delete on a single tap of a small unlabelled X, with no
 * confirmation and no undo, so one stray touch permanently removed a part.
 * The confirmation also reports how many stored challans use the name, since
 * deleting one of those leaves the old rows intact but makes the part
 * impossible to pick on a new challan.
 */
export function DeletePicklistItemButton({
  id,
  name,
  kind,
}: {
  id: string;
  name: string;
  kind: DcPicklistKind;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [usage, setUsage] = useState<number | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setUsage(null);
          return;
        }
        // Looked up on open so the count is current, and so the list itself
        // costs nothing to render.
        void countPicklistNameUsage(kind, name)
          .then(setUsage)
          .catch(() => setUsage(null));
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            aria-label={t("settings.removeAria", { name })}
          />
        }
      >
        <X className="h-3.5 w-3.5" />
      </DialogTrigger>

      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {kind === "component"
              ? t("settings.removeComponentTitle")
              : t("settings.removeMaterialTitle")}
          </DialogTitle>
          <DialogDescription>{t("settings.removeBody", { name })}</DialogDescription>
        </DialogHeader>

        {usage !== null && usage > 0 && (
          <div className="rounded-md border border-destructive bg-destructive/5 p-3">
            <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {usage === 1 ? t("settings.inUseOne") : t("settings.inUse", { count: usage })}
            </h3>
            <p className="text-xs text-destructive/90">{t("settings.inUseNote")}</p>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deletePicklistItemAction(id);
                  toast.success(t("settings.removed", { name }));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("settings.removeFailed"));
                }
              })
            }
          >
            {pending ? t("settings.removing") : t("settings.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

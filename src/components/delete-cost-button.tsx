"use client";

import { useTransition } from "react";
import { toast } from "sonner";
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
import { deleteCostAction } from "@/lib/actions/costs";
import { useI18n } from "@/components/i18n-provider";
import { Trash2 } from "lucide-react";

export function DeleteCostButton({ id, jobName }: { id: string; jobName: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" aria-label={t("costs.deleteAria", { jobName })} />
        }
      >
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("costs.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("costs.deleteBody", { jobName })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteCostAction(id);
                  toast.success(t("costs.deleted"));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("costs.deleteFailed"));
                }
              })
            }
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

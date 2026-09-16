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
import { deleteCustomerAction } from "@/lib/actions/customers";
import { useI18n } from "@/components/i18n-provider";
import { Trash2 } from "lucide-react";

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="destructive"
            size="sm"
            aria-label={t("customers.deleteAria", { name })}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("customers.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("customers.deleteBody", { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteCustomerAction(id);
                  toast.success(t("customers.deleted"));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("customers.deleteFailed"));
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

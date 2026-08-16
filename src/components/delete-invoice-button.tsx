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
import { deleteInvoiceAction } from "@/lib/actions/invoices";
import { Trash2 } from "lucide-react";

export function DeleteInvoiceButton({ id, invoiceNumber }: { id: string; invoiceNumber: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete invoice</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{invoiceNumber}&quot;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteInvoiceAction(id);
                  toast.success("Invoice deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to delete");
                }
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

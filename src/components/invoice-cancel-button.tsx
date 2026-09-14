"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelInvoiceAction } from "@/lib/actions/billing";

/**
 * Cancels an issued invoice. Invoices are never deleted: the cancelled invoice
 * and its number are kept, and the DC quantity it billed becomes billable again.
 */
export function InvoiceCancelButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const { error } = await cancelInvoiceAction(invoiceId, reason);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(
        `${invoiceNumber} cancelled. Its number is kept and its quantity can be billed again.`
      );
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        className="h-11 text-destructive sm:h-8"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" /> Cancel invoice
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 sm:w-96">
      <Label htmlFor="cancel-reason" className="text-sm font-medium text-destructive">
        Cancel {invoiceNumber}?
      </Label>
      <p className="text-xs text-muted-foreground">
        The invoice and its number are kept as cancelled. Its billed DC quantity is freed so a
        corrected invoice can be issued.
      </p>
      <Textarea
        id="cancel-reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason, for example: wrong rate"
      />
      <div className="flex gap-2 [&>*]:h-11 sm:[&>*]:h-8">
        <Button variant="destructive" disabled={pending || !reason.trim()} onClick={confirm}>
          {pending ? "Cancelling..." : "Confirm cancel"}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          Keep invoice
        </Button>
      </div>
    </div>
  );
}

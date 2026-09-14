"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePaymentAction } from "@/lib/actions/billing";
import type { PaymentStatus } from "@/types/database";

/** Records payment against an issued invoice: the only change it accepts. */
export function InvoicePaymentForm({
  invoiceId,
  status,
  amountPaid,
  grandTotal,
}: {
  invoiceId: string;
  status: PaymentStatus;
  amountPaid: number;
  grandTotal: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paid, setPaid] = useState(String(amountPaid));
  const [localStatus, setLocalStatus] = useState<PaymentStatus>(status);

  function save() {
    startTransition(async () => {
      const { error } = await updatePaymentAction(invoiceId, localStatus, Number(paid));
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Payment recorded.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Payment status</Label>
        <select
          className="h-11 w-36 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9"
          value={localStatus}
          onChange={(e) => setLocalStatus(e.target.value as PaymentStatus)}
        >
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Amount paid (₹)</Label>
        <Input
          type="number"
          min="0"
          max={grandTotal}
          step="any"
          className="h-11 w-36 sm:h-9"
          value={paid}
          onChange={(e) => setPaid(e.target.value)}
        />
      </div>
      <Button className="h-11 sm:h-9" disabled={pending} onClick={save}>
        {pending ? "Saving..." : "Record payment"}
      </Button>
    </div>
  );
}

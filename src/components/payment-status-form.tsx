"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePaymentStatusAction } from "@/lib/actions/invoices";
import type { PaymentStatus } from "@/types/database";

export function PaymentStatusForm({
  id,
  status,
  amountPaid,
  grandTotal,
}: {
  id: string;
  status: PaymentStatus;
  amountPaid: number;
  grandTotal: number;
}) {
  const [pending, startTransition] = useTransition();
  const [paid, setPaid] = useState(amountPaid);
  const [localStatus, setLocalStatus] = useState<PaymentStatus>(status);

  function save() {
    startTransition(async () => {
      try {
        await updatePaymentStatusAction(id, localStatus, paid);
        toast.success("Payment status updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <select
          className="h-9 w-36 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          value={localStatus}
          onChange={(e) => setLocalStatus(e.target.value as PaymentStatus)}
        >
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Amount Paid</Label>
        <Input
          type="number"
          min="0"
          max={grandTotal}
          step="any"
          className="w-32"
          value={paid}
          onChange={(e) => setPaid(Number(e.target.value))}
        />
      </div>
      <Button size="sm" disabled={pending} onClick={save}>
        {pending ? "Saving..." : "Update"}
      </Button>
    </div>
  );
}

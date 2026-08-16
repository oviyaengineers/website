"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerCombobox, type ComboboxCustomer } from "@/components/customer-combobox";
import { DatePicker } from "@/components/date-picker";
import { DcItemRows } from "@/components/dc-item-rows";
import type { DcFormState, DcItemInput } from "@/lib/actions/dc";
import type { DeliveryChallanRow } from "@/types/database";

export function DcForm({
  customers,
  dc,
  items,
  nextDcNumber,
  action,
}: {
  customers: ComboboxCustomer[];
  dc?: DeliveryChallanRow;
  items?: DcItemInput[];
  nextDcNumber?: string | null;
  action: (state: DcFormState, formData: FormData) => Promise<DcFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [customerId, setCustomerId] = useState(dc?.customer_id ?? "");
  const [date, setDate] = useState(dc?.dc_date ?? new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (dc?.customer_id) setCustomerId(dc.customer_id);
  }, [dc?.customer_id]);

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>DC Number</Label>
          <Input
            disabled
            value={dc?.dc_number ?? nextDcNumber ?? "Auto-generated"}
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dc_date">Date *</Label>
          <DatePicker value={date} onChange={setDate} name="dc_date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Customer *</Label>
        <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="vehicle_number">Vehicle Number</Label>
          <Input id="vehicle_number" name="vehicle_number" defaultValue={dc?.vehicle_number ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="driver_name">Driver Name</Label>
          <Input id="driver_name" name="driver_name" defaultValue={dc?.driver_name ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Items *</Label>
        <DcItemRows initialItems={items} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="authorized_by">Authorized By / Signature</Label>
          <Input id="authorized_by" name="authorized_by" defaultValue={dc?.authorized_by ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea id="remarks" name="remarks" rows={2} defaultValue={dc?.remarks ?? ""} />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : dc ? "Save changes" : "Create delivery challan"}
      </Button>
    </form>
  );
}

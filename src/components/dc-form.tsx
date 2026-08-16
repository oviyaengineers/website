"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [customerDcDate, setCustomerDcDate] = useState(dc?.customer_dc_date ?? "");

  useEffect(() => {
    if (dc?.customer_id) setCustomerId(dc.customer_id);
  }, [dc?.customer_id]);

  return (
    <form action={formAction} className="space-y-6 max-w-4xl">
      <Card className="border-t-4 border-t-[#10233f]">
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Delivery Challan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Our DC Number</Label>
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
          <div className="space-y-2">
            <Label htmlFor="customer_dc_number">Customer DC Number</Label>
            <Input
              id="customer_dc_number"
              name="customer_dc_number"
              placeholder="Customer DC No."
              defaultValue={dc?.customer_dc_number ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_dc_date">Customer DC Date</Label>
            <DatePicker value={customerDcDate} onChange={setCustomerDcDate} name="customer_dc_date" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Customer Name *</Label>
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job_order_no">Job Order / PO No.</Label>
            <Input
              id="job_order_no"
              name="job_order_no"
              placeholder="Job Order No."
              defaultValue={dc?.job_order_no ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle_number">Vehicle No.</Label>
            <Input
              id="vehicle_number"
              name="vehicle_number"
              placeholder="TN XX XX XXXX"
              defaultValue={dc?.vehicle_number ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="driver_name">Driver Name</Label>
            <Input id="driver_name" name="driver_name" defaultValue={dc?.driver_name ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Material / Component Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DcItemRows initialItems={items} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Remarks &amp; Signature</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="authorized_by">Authorized By / Signature</Label>
            <Input id="authorized_by" name="authorized_by" defaultValue={dc?.authorized_by ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="remarks">General Remarks</Label>
            <Textarea
              id="remarks"
              name="remarks"
              rows={2}
              placeholder="Job completed / Rework / Return details..."
              defaultValue={dc?.remarks ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="bg-[#10233f] hover:bg-[#10233f]/90">
        {pending ? "Saving..." : dc ? "Save changes" : "Create delivery challan"}
      </Button>
    </form>
  );
}

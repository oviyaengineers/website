"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CostFormState } from "@/lib/actions/costs";

export function CostForm({
  dcs,
  invoices,
  action,
}: {
  dcs: { id: string; dc_number: string }[];
  invoices: { id: string; invoice_number: string }[];
  action: (state: CostFormState, formData: FormData) => Promise<CostFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [material, setMaterial] = useState(0);
  const [hours, setHours] = useState(0);
  const [rate, setRate] = useState(0);
  const [labor, setLabor] = useState(0);
  const [tooling, setTooling] = useState(0);
  const [overhead, setOverhead] = useState(0);

  const total = useMemo(
    () => material + hours * rate + labor + tooling + overhead,
    [material, hours, rate, labor, tooling, overhead]
  );

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="job_name">Job Name *</Label>
        <Input id="job_name" name="job_name" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dc_id">Linked Delivery Challan</Label>
          <select
            id="dc_id"
            name="dc_id"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">None</option>
            {dcs.map((dc) => (
              <option key={dc.id} value={dc.id}>
                {dc.dc_number}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice_id">Linked Invoice</Label>
          <select
            id="invoice_id"
            name="invoice_id"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">None</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="material_cost">Material Cost (₹)</Label>
          <Input
            id="material_cost"
            name="material_cost"
            type="number"
            min="0"
            step="any"
            value={material}
            onChange={(e) => setMaterial(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="labor_cost">Labor Cost (₹)</Label>
          <Input
            id="labor_cost"
            name="labor_cost"
            type="number"
            min="0"
            step="any"
            value={labor}
            onChange={(e) => setLabor(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="machine_hours">Machine Hours</Label>
          <Input
            id="machine_hours"
            name="machine_hours"
            type="number"
            min="0"
            step="any"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine_rate">Machine Rate (₹/hr)</Label>
          <Input
            id="machine_rate"
            name="machine_rate"
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tooling_cost">Tooling Cost (₹)</Label>
          <Input
            id="tooling_cost"
            name="tooling_cost"
            type="number"
            min="0"
            step="any"
            value={tooling}
            onChange={(e) => setTooling(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="overhead_cost">Overhead Cost (₹)</Label>
          <Input
            id="overhead_cost"
            name="overhead_cost"
            type="number"
            min="0"
            step="any"
            value={overhead}
            onChange={(e) => setOverhead(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <div className="flex justify-between font-semibold">
          <span>Total Job Cost</span>
          <span>₹{total.toFixed(2)}</span>
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Log job cost"}
      </Button>
    </form>
  );
}

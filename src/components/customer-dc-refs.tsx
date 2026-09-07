"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { DcRefLookup } from "@/components/dc-ref-lookup";
import { CustomerDcRefPicker } from "@/components/customer-dc-ref-picker";
import type { StoredDcMatch } from "@/lib/actions/dc-lookup";

let refId = 0;
function nextId() {
  refId += 1;
  return refId;
}

export type CustomerDcRef = { number: string; date: string; key: number };

export function emptyCustomerDcRef(): CustomerDcRef {
  return { number: "", date: "", key: nextId() };
}

export function makeCustomerDcRefs(
  numbers?: string[] | null,
  dates?: (string | null)[] | null
): CustomerDcRef[] {
  if (numbers && numbers.length > 0) {
    return numbers.map((number, i) => ({ number, date: dates?.[i] ?? "", key: nextId() }));
  }
  return [emptyCustomerDcRef()];
}

export function CustomerDcRefs({
  rows,
  onRowsChange,
  excludeDcId,
  customerId,
  onUseStoredDc,
}: {
  rows: CustomerDcRef[];
  onRowsChange: (updater: (rows: CustomerDcRef[]) => CustomerDcRef[]) => void;
  /** The challan being edited, so it does not list itself as a match. */
  excludeDcId?: string | null;
  /** Selected customer, used to offer the DC numbers on file for them. */
  customerId?: string;
  /** Called when a stored reference is chosen, so its items can be copied in. */
  onUseStoredDc?: (match: StoredDcMatch) => void;
}) {
  function addRow() {
    onRowsChange((r) => [...r, emptyCustomerDcRef()]);
  }

  function removeRow(key: number) {
    onRowsChange((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<CustomerDcRef>) {
    onRowsChange((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Customer DC Number(s)</Label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_1fr_auto_36px] gap-2">
            <Input
              name="customer_dc_number"
              placeholder="Customer DC No."
              value={row.number}
              onChange={(e) => updateRow(row.key, { number: e.target.value })}
            />
            <DatePicker
              value={row.date}
              onChange={(v) => updateRow(row.key, { date: v })}
              name="customer_dc_date"
            />
            {/* Both of these appear and disappear with the data, so they share
                one cell — otherwise the grid tracks shift as they mount. */}
            <div className="flex items-center gap-2">
              {customerId ? (
                <CustomerDcRefPicker
                  customerId={customerId}
                  date={row.date}
                  excludeDcId={excludeDcId}
                  onPick={(option) => {
                    updateRow(row.key, { number: option.number, date: option.date ?? row.date });
                    onUseStoredDc?.(option.match);
                  }}
                />
              ) : null}
              <DcRefLookup number={row.number} date={row.date} excludeDcId={excludeDcId} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => removeRow(row.key)}
              disabled={rows.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" /> Add another Customer DC No.
      </Button>
    </div>
  );
}

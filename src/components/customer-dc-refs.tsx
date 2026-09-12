"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { DcRefLookup } from "@/components/dc-ref-lookup";
import { CustomerDcRefPicker } from "@/components/customer-dc-ref-picker";
import { DcDateComponents, type DateComponentPick } from "@/components/dc-date-components";
import type { StoredDcMatch } from "@/lib/actions/dc-lookup";

let refId = 0;
function nextId() {
  refId += 1;
  return refId;
}

export type CustomerDcRef = {
  number: string;
  date: string;
  key: number;
  /** The queued scan this reference came from; see DcItemRow.sourceScanId. */
  sourceScanId?: string;
};

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
  onFillDateComponents,
}: {
  rows: CustomerDcRef[];
  onRowsChange: (updater: (rows: CustomerDcRef[]) => CustomerDcRef[]) => void;
  /** The challan being edited, so it does not list itself as a match. */
  excludeDcId?: string | null;
  /** Selected customer, used to offer the DC numbers on file for them. */
  customerId?: string;
  /** Called when a stored reference is chosen, so its items can be copied in. */
  onUseStoredDc?: (match: StoredDcMatch) => void;
  /** Called to copy every component recorded on a customer DC date. */
  onFillDateComponents?: (items: DateComponentPick[], sourceLabel: string) => void;
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

  // With a customer chosen, the panel under each row already lists everything
  // stored for that date, so the floating lookup would only repeat it — and
  // cover it, being fixed position. Without one, that panel cannot run and the
  // floating lookup stays the only way to see a date's challans.
  const showsDateComponents = Boolean(customerId && onFillDateComponents);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Customer DC Number(s)</Label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="space-y-2">
            {/* On a phone the reference takes a line of its own: squeezed into
                a quarter of the width it showed about four characters, which is
                not enough to check a number like 0DC26-27/1018 against the
                paper in the other hand. */}
            <div className="grid grid-cols-[1fr_auto_36px] gap-2 sm:grid-cols-[1fr_1fr_auto_36px]">
              <Input
                className="col-span-3 sm:col-span-1"
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
                <DcRefLookup
                  number={row.number}
                  date={row.date}
                  excludeDcId={excludeDcId}
                  dateCoveredElsewhere={showsDateComponents}
                />
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

            {/* Once a customer and a date are both known, everything recorded
                on that date is listed here without a further click. */}
            {/* One panel per row. Once a reference is entered, the lookup for
                that exact reference is the more specific answer and takes the
                row; until then this lists the whole date. Written as a
                truthiness check, not showsDateComponents, so customerId
                narrows to a string here. */}
            {customerId && onFillDateComponents && !row.number.trim() ? (
              <DcDateComponents
                customerId={customerId}
                date={row.date}
                excludeDcId={excludeDcId}
                onFill={onFillDateComponents}
              />
            ) : null}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" /> Add another Customer DC No.
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";

let refId = 0;
function nextId() {
  refId += 1;
  return refId;
}

type Ref = { number: string; date: string; key: number };

function emptyRef(): Ref {
  return { number: "", date: "", key: nextId() };
}

export function CustomerDcRefs({
  initialNumbers,
  initialDates,
}: {
  initialNumbers?: string[] | null;
  initialDates?: (string | null)[] | null;
}) {
  const [rows, setRows] = useState<Ref[]>(() => {
    if (initialNumbers && initialNumbers.length > 0) {
      return initialNumbers.map((number, i) => ({
        number,
        date: initialDates?.[i] ?? "",
        key: nextId(),
      }));
    }
    return [emptyRef()];
  });

  function addRow() {
    setRows((r) => [...r, emptyRef()]);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<Ref>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Customer DC Number(s)</Label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_1fr_36px] gap-2">
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

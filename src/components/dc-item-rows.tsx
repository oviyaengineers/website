"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DcItemInput } from "@/lib/actions/dc";

let rowId = 0;
function nextId() {
  rowId += 1;
  return rowId;
}

type Row = DcItemInput & { key: number };

export function DcItemRows({ initialItems }: { initialItems?: DcItemInput[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({ ...item, key: nextId() }))
      : [{ description: "", quantity: 1, unit: "nos", remarks: "", key: nextId() }]
  );

  function addRow() {
    setRows((r) => [...r, { description: "", quantity: 1, unit: "nos", remarks: "", key: nextId() }]);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_90px_90px_1fr_36px]">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Remarks</span>
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_90px_90px_1fr_36px] sm:items-center sm:border-0 sm:p-0"
        >
          <div className="space-y-1">
            <Label className="sm:hidden">Description</Label>
            <Input
              name="item_description"
              placeholder="Item description"
              value={row.description}
              onChange={(e) => updateRow(row.key, { description: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <div className="space-y-1">
              <Label className="sm:hidden">Qty</Label>
              <Input
                name="item_quantity"
                type="number"
                min="0"
                step="any"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="sm:hidden">Unit</Label>
              <Input
                name="item_unit"
                placeholder="nos"
                value={row.unit}
                onChange={(e) => updateRow(row.key, { unit: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="sm:hidden">Remarks</Label>
            <Input
              name="item_remarks"
              placeholder="Optional"
              value={row.remarks ?? ""}
              onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive sm:justify-self-center"
            onClick={() => removeRow(row.key)}
            disabled={rows.length === 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" /> Add item
      </Button>
    </div>
  );
}

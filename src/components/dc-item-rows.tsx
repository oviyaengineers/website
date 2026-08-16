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

function emptyRow(): Row {
  return {
    component: "",
    material: "",
    received_qty: 0,
    sent_qty: 0,
    remarks: "",
    key: nextId(),
  };
}

export function DcItemRows({ initialItems }: { initialItems?: DcItemInput[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({ ...item, key: nextId() }))
      : [emptyRow()]
  );

  function addRow() {
    setRows((r) => [...r, emptyRow()]);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_90px_90px_90px_1fr_36px]">
        <span>Component</span>
        <span>Material</span>
        <span>Received Qty</span>
        <span>Sent Qty</span>
        <span>Balance</span>
        <span>Remarks</span>
        <span />
      </div>
      {rows.map((row) => {
        const balance = (Number(row.received_qty) || 0) - (Number(row.sent_qty) || 0);
        return (
          <div
            key={row.key}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_90px_90px_90px_1fr_36px] sm:items-center sm:border-0 sm:p-0"
          >
            <div className="space-y-1">
              <Label className="sm:hidden">Component</Label>
              <Input
                name="item_component"
                placeholder="Component"
                value={row.component}
                onChange={(e) => updateRow(row.key, { component: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="sm:hidden">Material</Label>
              <Input
                name="item_material"
                placeholder="Material"
                value={row.material ?? ""}
                onChange={(e) => updateRow(row.key, { material: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <div className="space-y-1">
                <Label className="sm:hidden">Received Qty</Label>
                <Input
                  name="item_received_qty"
                  type="number"
                  min="0"
                  step="any"
                  value={row.received_qty}
                  onChange={(e) => updateRow(row.key, { received_qty: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="sm:hidden">Sent Qty</Label>
                <Input
                  name="item_sent_qty"
                  type="number"
                  min="0"
                  step="any"
                  value={row.sent_qty}
                  onChange={(e) => updateRow(row.key, { sent_qty: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="sm:hidden">Balance</Label>
              <Input disabled value={balance} className="bg-muted" />
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
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" /> Add Component
      </Button>
    </div>
  );
}

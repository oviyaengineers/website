"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    material_problem_qty: 0,
    rejection_qty: 0,
    key: nextId(),
  };
}

export function DcItemRows({
  initialItems,
  components,
  materials,
}: {
  initialItems?: DcItemInput[];
  components: string[];
  materials: string[];
}) {
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
      <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_80px_80px_100px_80px_80px_36px]">
        <span>Component</span>
        <span>Material</span>
        <span>Received</span>
        <span>Sent</span>
        <span>Material Problem</span>
        <span>Rejection</span>
        <span>Total</span>
        <span />
      </div>
      {rows.map((row) => {
        const total =
          (Number(row.sent_qty) || 0) +
          (Number(row.material_problem_qty) || 0) +
          (Number(row.rejection_qty) || 0);
        return (
          <div
            key={row.key}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_80px_80px_100px_80px_80px_36px] sm:items-center sm:border-0 sm:p-0"
          >
            <div className="space-y-1">
              <Label className="sm:hidden">Component</Label>
              <input type="hidden" name="item_component" value={row.component} />
              <Select
                value={row.component || undefined}
                onValueChange={(v) => updateRow(row.key, { component: v ?? "" })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {components.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Add components in Settings
                    </div>
                  )}
                  {components.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="sm:hidden">Material</Label>
              <input type="hidden" name="item_material" value={row.material ?? ""} />
              <Select
                value={row.material || undefined}
                onValueChange={(v) => updateRow(row.key, { material: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Add materials in Settings
                    </div>
                  )}
                  {materials.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <div className="space-y-1">
                <Label className="sm:hidden">Material Problem</Label>
                <Input
                  name="item_material_problem_qty"
                  type="number"
                  min="0"
                  step="any"
                  value={row.material_problem_qty}
                  onChange={(e) =>
                    updateRow(row.key, { material_problem_qty: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="sm:hidden">Rejection</Label>
                <Input
                  name="item_rejection_qty"
                  type="number"
                  min="0"
                  step="any"
                  value={row.rejection_qty}
                  onChange={(e) => updateRow(row.key, { rejection_qty: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="sm:hidden">Total</Label>
              <Input disabled value={total} className="bg-muted" />
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

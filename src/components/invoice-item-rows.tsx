"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceItemInput } from "@/lib/actions/invoices";

let rowId = 0;
function nextId() {
  rowId += 1;
  return rowId;
}

type Row = InvoiceItemInput & { key: number };

export function InvoiceItemRows({
  initialItems,
  gstRate,
  discount,
  onTotalsChange,
}: {
  initialItems?: InvoiceItemInput[];
  gstRate: number;
  discount: number;
  onTotalsChange?: (totals: { subtotal: number; gst: number; grandTotal: number }) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({ ...item, key: nextId() }))
      : [{ description: "", quantity: 1, unit: "nos", unit_price: 0, key: nextId() }]
  );

  const subtotal = rows.reduce((sum, r) => sum + r.quantity * r.unit_price, 0);
  const gst = (subtotal * gstRate) / 100;
  const grandTotal = subtotal + gst - discount;

  useEffect(() => {
    onTotalsChange?.({ subtotal, gst, grandTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, gst, grandTotal]);

  function addRow() {
    setRows((r) => [...r, { description: "", quantity: 1, unit: "nos", unit_price: 0, key: nextId() }]);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_80px_80px_100px_100px_36px]">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Unit Price</span>
        <span>Amount</span>
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_80px_80px_100px_100px_36px] sm:items-center sm:border-0 sm:p-0"
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
            <Label className="sm:hidden">Unit Price</Label>
            <Input
              name="item_unit_price"
              type="number"
              min="0"
              step="any"
              value={row.unit_price}
              onChange={(e) => updateRow(row.key, { unit_price: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="sm:hidden">Amount</Label>
            <Input disabled value={(row.quantity * row.unit_price).toFixed(2)} className="bg-muted" />
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
        <Plus className="h-4 w-4" /> Add line item
      </Button>
    </div>
  );
}

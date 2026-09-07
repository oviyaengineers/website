"use client";

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
import { balanceQty, outwardTotal } from "@/lib/dc-balance";

let rowId = 0;
function nextId() {
  rowId += 1;
  return rowId;
}

export type DcItemRow = DcItemInput & { key: number };

export function emptyDcItemRow(): DcItemRow {
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

export function makeDcItemRows(items?: DcItemInput[]): DcItemRow[] {
  if (items && items.length > 0) {
    return items.map((item) => ({ ...item, key: nextId() }));
  }
  return [emptyDcItemRow()];
}

/** True when the row is still untouched, so a scan can replace it. */
export function isBlankDcItemRow(row: DcItemRow): boolean {
  return (
    row.component.trim() === "" &&
    !row.material &&
    !row.received_qty &&
    !row.sent_qty &&
    !row.material_problem_qty &&
    !row.rejection_qty
  );
}

export function DcItemRows({
  rows,
  onRowsChange,
  components,
  materials,
}: {
  rows: DcItemRow[];
  onRowsChange: (updater: (rows: DcItemRow[]) => DcItemRow[]) => void;
  components: string[];
  materials: string[];
}) {
  function addRow() {
    onRowsChange((r) => [...r, emptyDcItemRow()]);
  }

  function removeRow(key: number) {
    onRowsChange((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function updateRow(key: number, patch: Partial<DcItemRow>) {
    onRowsChange((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {/* Nine columns no longer fit a laptop card, so the grid scrolls inside
          itself rather than pushing the whole page sideways. The stacked mobile
          layout keeps its natural width. */}
      <div className="overflow-x-auto">
        <div className="space-y-3 sm:min-w-[1000px]">
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_80px_80px_100px_80px_80px_90px_36px]">
            <span>Description</span>
            <span>Material</span>
            <span>Received</span>
            <span>Sent</span>
            <span>Material Problem</span>
            <span>Rejection</span>
            <span>Total</span>
            <span>Balance</span>
            <span />
          </div>
          {rows.map((row) => {
            const total = outwardTotal(row);
            const balance = balanceQty(row);
            const overDelivered = balance < 0;
            return (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_80px_80px_100px_80px_80px_90px_36px] sm:items-center sm:border-0 sm:p-0"
              >
                <div className="space-y-1">
                  <Label className="sm:hidden">Description</Label>
                  <input type="hidden" name="item_component" value={row.component} />
                  <Select
                    value={row.component || null}
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
                    value={row.material || null}
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
                      onChange={(e) =>
                        updateRow(row.key, {
                          received_qty: Number(e.target.value),
                        })
                      }
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
                        updateRow(row.key, {
                          material_problem_qty: Number(e.target.value),
                        })
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
                      onChange={(e) =>
                        updateRow(row.key, {
                          rejection_qty: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="sm:hidden">Total</Label>
                  <Input disabled value={total} className="bg-muted" />
                </div>
                <div className="space-y-1">
                  <Label className="sm:hidden">Balance</Label>
                  <Input
                    disabled
                    value={overDelivered ? `${balance} extra` : balance}
                    className={
                      overDelivered
                        ? "border-destructive bg-destructive/10 font-medium text-destructive"
                        : "bg-muted"
                    }
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
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" /> Add Component
      </Button>
    </div>
  );
}

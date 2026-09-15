"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { useI18n } from "@/components/i18n-provider";
import type { DcItemInput } from "@/lib/actions/dc";
import { balanceQty, outwardTotal } from "@/lib/dc-balance";
import { ComponentPendingDcs } from "@/components/component-pending-dcs";

let rowId = 0;
function nextId() {
  rowId += 1;
  return rowId;
}

export type DcItemRow = DcItemInput & {
  key: number;
  /**
   * The queued scan this row came from, when it came from one.
   *
   * The scan queue survives until a challan is saved, so opening the new-DC
   * form a second time replays it. With no mark saying which rows a given scan
   * already produced, the replay appended them again — DC-2026-0001 was saved
   * with every scanned part on it twice.
   */
  sourceScanId?: string;
};

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
  excludeDcId,
  outstandingByParent,
}: {
  rows: DcItemRow[];
  onRowsChange: (updater: (rows: DcItemRow[]) => DcItemRow[]) => void;
  components: string[];
  materials: string[];
  /** The challan being edited, so it is not listed as pending against itself. */
  excludeDcId?: string | null;
  /**
   * What each line being continued still owes, keyed by that line's id.
   *
   * A continuation row received nothing itself, so read on its own it would
   * show every piece it despatches as delivered over. The balance the
   * operator needs is the one left on the original line.
   */
  outstandingByParent?: Record<string, number>;
}) {
  const { t } = useI18n();
  const everyRowContinues = rows.length > 0 && rows.every((row) => Boolean(row.parent_item_id));

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
            <span>{t("dc.cols.description")}</span>
            <span>{t("common.material")}</span>
            {/* Named for what the column actually holds. On a challan that only
                continues earlier work no row receives anything, so the figure
                under this heading is what is left to send. */}
            <span>{everyRowContinues ? t("dc.qty.pending") : t("dc.qty.received")}</span>
            <span>{t("dc.qty.sent")}</span>
            <span>{t("dcDetail.materialProblem")}</span>
            <span>{t("dc.qty.rejection")}</span>
            <span>{t("dc.qty.total")}</span>
            <span>{t("dc.qty.balance")}</span>
            <span />
          </div>
          {rows.map((row) => {
            const total = outwardTotal(row);
            const owed = row.parent_item_id ? outstandingByParent?.[row.parent_item_id] : undefined;
            const balance = owed === undefined ? balanceQty(row) : owed - total;
            const overDelivered = balance < 0;
            return (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border p-3 [&_[data-slot=select-trigger]]:h-11 sm:[&_[data-slot=select-trigger]]:h-8 sm:grid-cols-[1fr_1fr_80px_80px_100px_80px_80px_90px_36px] sm:items-center sm:border-0 sm:p-0"
              >
                <div className="space-y-1">
                  <Label className="sm:hidden">{t("dc.cols.description")}</Label>
                  <input type="hidden" name="item_component" value={row.component} />
                  {/* The stored line's id when editing, empty on a new row. An
                      edited line keeps its id, which is what any follow-up DC
                      raised against it points at. */}
                  <input type="hidden" name="item_id" value={row.id ?? ""} />
                  {/* Emitted for every row, empty where the row is an original,
                      so the parsed arrays stay aligned with the other fields. */}
                  <input
                    type="hidden"
                    name="item_parent_item_id"
                    value={row.parent_item_id ?? ""}
                  />
                  {/* Typed into to search, but only a component from Settings
                      can be chosen. A row that has quantities and no component
                      is marked, and the form will not save it. */}
                  <SearchableSelect
                    options={components}
                    value={row.component || null}
                    onChange={(v) => updateRow(row.key, { component: v ?? "" })}
                    searchPlaceholder={t("dcForm.searchComponents")}
                    emptyText={
                      components.length === 0
                        ? t("dcForm.addComponentsInSettings")
                        : t("dcForm.noComponentMatch")
                    }
                    invalid={!row.component && !isBlankDcItemRow(row)}
                    ariaLabel={t("dc.cols.description")}
                    className="sm:min-h-8"
                  />
                  {/* Choosing a part is the moment to see what is already
                      outstanding on it elsewhere. */}
                  <ComponentPendingDcs component={row.component} excludeDcId={excludeDcId} />
                </div>
                <div className="space-y-1">
                  <Label className="sm:hidden">{t("common.material")}</Label>
                  <input type="hidden" name="item_material" value={row.material ?? ""} />
                  <SearchableSelect
                    options={materials}
                    value={row.material || null}
                    onChange={(v) => updateRow(row.key, { material: v })}
                    searchPlaceholder={t("dcForm.searchMaterials")}
                    emptyText={
                      materials.length === 0
                        ? t("dcForm.addMaterialsInSettings")
                        : t("dcForm.noMaterialMatch")
                    }
                    allowClear
                    ariaLabel={t("common.material")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 [&_input]:h-11 sm:contents sm:[&_input]:h-8">
                  <div className="space-y-1">
                    <Label className="sm:hidden">
                      {owed === undefined ? t("dcDetail.receivedQty") : t("dc.qty.pending")}
                    </Label>
                    {owed === undefined ? (
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
                    ) : (
                      <>
                        {/* A continuation receives nothing: the pieces came in
                            on the original challan and are counted there. What
                            matters here is what is left of them, so the cell
                            shows that instead of asking for a quantity. The
                            zero still travels, because the parsed arrays are
                            positional and every row must fill every field. */}
                        <input type="hidden" name="item_received_qty" value={row.received_qty} />
                        <Input disabled value={owed} className="bg-muted" />
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="sm:hidden">{t("dcDetail.sentQty")}</Label>
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
                <div className="grid grid-cols-2 gap-2 [&_input]:h-11 sm:contents sm:[&_input]:h-8">
                  <div className="space-y-1">
                    <Label className="sm:hidden">{t("dcDetail.materialProblem")}</Label>
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
                    <Label className="sm:hidden">{t("dc.qty.rejection")}</Label>
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
                  <Label className="sm:hidden">{t("dc.qty.total")}</Label>
                  <Input disabled value={total} className="bg-muted" />
                </div>
                <div className="space-y-1">
                  <Label className="sm:hidden">{t("dc.qty.balance")}</Label>
                  <Input
                    disabled
                    value={overDelivered ? t("dc.list.extra", { count: balance }) : balance}
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
                  aria-label={t("dcForm.removeRow")}
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
        <Plus className="h-4 w-4" /> {t("dcForm.addComponent")}
      </Button>
    </div>
  );
}

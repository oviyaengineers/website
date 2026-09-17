import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterWeightLines,
  summarizeWeightLines,
  weightLineFromRow,
  type WeightLine,
} from "@/lib/weight-lines";
import type { DcWeightLineRow } from "@/types/database";

function row(over: Partial<DcWeightLineRow>): DcWeightLineRow {
  return {
    dc_item_id: "i1",
    dc_id: "d1",
    dc_number: "26-27-030",
    dc_date: "2026-09-10",
    dc_status: "active",
    customer_id: "c1",
    customer_name: "Moreind Automation Private Limited",
    component: "Shaft",
    component_id: "p1",
    material: "EN8",
    sort_order: 0,
    sent_qty: 500,
    weight_state: "not_configured",
    weight_id: null,
    weight_master_id: null,
    recorded_unit: null,
    recorded_rough_g: null,
    recorded_finished_g: null,
    recorded_scrap_g: null,
    sent_qty_at_save: null,
    scrap_rate_per_kg: null,
    total_scrap_g: null,
    scrap_value: null,
    recorded_at: null,
    sent_qty_changed: false,
    master_id: null,
    master_unit: null,
    master_rough_g: null,
    master_finished_g: null,
    master_scrap_g: null,
    ...over,
  };
}

const PENDING = {
  weight_state: "pending" as const,
  master_id: "m1",
  master_unit: "kg" as const,
  master_rough_g: 1200,
  master_finished_g: 1000,
  master_scrap_g: 200,
};

const RECORDED = {
  weight_state: "recorded" as const,
  weight_id: "w1",
  weight_master_id: "m1",
  recorded_unit: "kg" as const,
  recorded_rough_g: "1200.000" as unknown as number,
  recorded_finished_g: "1000.000" as unknown as number,
  recorded_scrap_g: "200.000" as unknown as number,
  sent_qty_at_save: "500.00" as unknown as number,
  scrap_rate_per_kg: "80.00" as unknown as number,
  total_scrap_g: "100000.000" as unknown as number,
  scrap_value: "8000.00" as unknown as number,
  recorded_at: "2026-09-17T08:00:00Z",
};

test("no active master: not configured, and no weights at all", () => {
  const line = weightLineFromRow(row({}));
  assert.equal(line.status, "notConfigured");
  assert.equal(line.master, null);
  assert.equal(line.recorded, null);
});

test("an active master: pending, with scrap worked out on the DC's Sent Qty", () => {
  const line = weightLineFromRow(row(PENDING));
  assert.equal(line.status, "pending");
  assert.equal(line.master?.scrapPerPieceMg, 200_000);
  assert.equal(line.master?.totalScrapMg, 100_000_000, "0.2 kg × 500 = 100 kg");
  assert.equal(line.recorded, null);
});

test("a recorded line shows exactly what was stored", () => {
  const line = weightLineFromRow(row(RECORDED));
  assert.equal(line.status, "recorded");
  assert.equal(line.recorded?.roughMg, 1_200_000);
  assert.equal(line.recorded?.totalScrapMg, 100_000_000);
  assert.equal(line.recorded?.valuePaise, 800_000, "₹8,000");
  assert.equal(line.recorded?.ratePaisePerKg, 8000);
  assert.equal(line.master, null, "a recorded line never shows the current master");
});

test("a changed Sent Qty is flagged and the recorded totals stay", () => {
  const line = weightLineFromRow(row({ ...RECORDED, sent_qty: 480, sent_qty_changed: true }));
  assert.equal(line.status, "sentChanged");
  assert.equal(line.sentQty, 480);
  assert.equal(line.recorded?.sentQty, 500);
  assert.equal(line.recorded?.totalScrapMg, 100_000_000);
});

const lines: WeightLine[] = [
  weightLineFromRow(row({ dc_item_id: "a", ...PENDING })),
  weightLineFromRow(row({ dc_item_id: "b", component: "Flange", material: "Cf8m" })),
  weightLineFromRow(row({ dc_item_id: "c", component: "Bracket", ...RECORDED })),
  weightLineFromRow(
    row({
      dc_item_id: "d",
      dc_id: "d2",
      dc_number: "26-27-031",
      dc_date: "2026-09-16",
      customer_name: "Other Ltd",
      ...RECORDED,
      sent_qty: 480,
      sent_qty_changed: true,
    })
  ),
];
const ids = (list: WeightLine[]) => list.map((l) => l.itemId).join(",");

test("pending and completed weight filters", () => {
  assert.equal(ids(filterWeightLines(lines, {})), "a,b,c,d");
  assert.equal(ids(filterWeightLines(lines, { state: "pending" })), "a,b");
  assert.equal(ids(filterWeightLines(lines, { state: "completed" })), "c,d");
  assert.equal(ids(filterWeightLines(lines, { state: "notConfigured" })), "b");
  assert.equal(ids(filterWeightLines(lines, { state: "sentChanged" })), "d");
});

test("DC no, customer, component, material, dates and search", () => {
  assert.equal(ids(filterWeightLines(lines, { dcNo: "031" })), "d");
  assert.equal(ids(filterWeightLines(lines, { customer: "Other Ltd" })), "d");
  assert.equal(ids(filterWeightLines(lines, { component: "Flange" })), "b");
  assert.equal(ids(filterWeightLines(lines, { material: "cf8m" })), "b");
  assert.equal(ids(filterWeightLines(lines, { from: "2026-09-11" })), "d");
  assert.equal(ids(filterWeightLines(lines, { to: "2026-09-10" })), "a,b,c");
  assert.equal(ids(filterWeightLines(lines, { q: "bracket" })), "c");
});

test("totals count only what was recorded, as recorded", () => {
  const totals = summarizeWeightLines(lines);
  assert.equal(totals.lines, 4);
  assert.equal(totals.recordedLines, 2);
  assert.equal(totals.pendingLines, 1);
  assert.equal(totals.notConfiguredLines, 1);
  assert.equal(totals.sentChangedLines, 1);
  assert.equal(totals.recordedQty, 1000, "both recorded with 500");
  assert.equal(totals.totalScrapMg, 200_000_000);
  assert.equal(totals.totalValuePaise, 1_600_000);
});

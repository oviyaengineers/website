import { matchesTerm } from "@/lib/dc-search";
import {
  gramsToMilligrams,
  isWeightUnit,
  scrapFigures,
  type WeightStatus,
  type WeightUnit,
} from "@/lib/weight";
import type { DcWeightLineRow } from "@/types/database";

/**
 * One delivery challan line as the Weight / Scrap screens show it.
 *
 * Every line is its own row, with its own Sent Qty exactly as stored on that
 * line. Weights come from the recorded snapshot, or, before recording, from
 * the active Weight Master for the line's Component + Material. With neither,
 * there are no weights at all: nothing is guessed.
 */
export type WeightLine = {
  itemId: string;
  dcId: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  component: string;
  material: string | null;
  /** This line's own Sent Qty, read from the challan. Never entered here. */
  sentQty: number;
  sortOrder: number;
  status: WeightStatus;
  /** What was recorded, exactly as stored. */
  recorded: {
    unit: WeightUnit;
    roughMg: number;
    finishedMg: number;
    scrapPerPieceMg: number;
    /** The Sent Qty the recorded totals use. */
    sentQty: number;
    ratePaisePerKg: number;
    totalScrapMg: number;
    valuePaise: number;
    recordedAt: string | null;
  } | null;
  /** The active master a line not yet recorded would use. */
  master: {
    id: string;
    unit: WeightUnit;
    roughMg: number;
    finishedMg: number;
    scrapPerPieceMg: number;
    /** Scrap per piece × the line's current Sent Qty. */
    totalScrapMg: number;
  } | null;
};

const unitOf = (value: string | null | undefined): WeightUnit =>
  isWeightUnit(value) ? value : "g";

/** A view row as a screen line. */
export function weightLineFromRow(row: DcWeightLineRow): WeightLine {
  const sentQty = Number(row.sent_qty) || 0;
  const isRecorded = row.weight_state === "recorded" && row.weight_id !== null;
  const recorded = isRecorded
    ? {
        unit: unitOf(row.recorded_unit),
        roughMg: gramsToMilligrams(row.recorded_rough_g ?? 0),
        finishedMg: gramsToMilligrams(row.recorded_finished_g ?? 0),
        scrapPerPieceMg: gramsToMilligrams(row.recorded_scrap_g ?? 0),
        sentQty: Number(row.sent_qty_at_save) || 0,
        ratePaisePerKg: Math.round(Number(row.scrap_rate_per_kg ?? 0) * 100),
        totalScrapMg: gramsToMilligrams(row.total_scrap_g ?? 0),
        valuePaise: Math.round(Number(row.scrap_value ?? 0) * 100),
        recordedAt: row.recorded_at,
      }
    : null;
  let master: WeightLine["master"] = null;
  if (!isRecorded && row.weight_state === "pending" && row.master_id) {
    const roughMg = gramsToMilligrams(row.master_rough_g ?? 0);
    const finishedMg = gramsToMilligrams(row.master_finished_g ?? 0);
    const figures = scrapFigures(roughMg, finishedMg, sentQty, null);
    master = {
      id: row.master_id,
      unit: unitOf(row.master_unit),
      roughMg,
      finishedMg,
      scrapPerPieceMg: figures.scrapPerPieceMg,
      totalScrapMg: figures.totalScrapMg,
    };
  }
  const status: WeightStatus = recorded
    ? row.sent_qty_changed
      ? "sentChanged"
      : "recorded"
    : master
      ? "pending"
      : "notConfigured";
  return {
    itemId: row.dc_item_id,
    dcId: row.dc_id,
    dcNumber: row.dc_number,
    dcDate: row.dc_date,
    customerName: row.customer_name ?? "-",
    component: row.component,
    material: row.material,
    sentQty,
    sortOrder: row.sort_order,
    status,
    recorded,
    master,
  };
}

export type WeightFilterValues = {
  q?: string;
  from?: string;
  to?: string;
  /** pending, completed, notConfigured or sentChanged; blank for every line. */
  state?: string;
  customer?: string;
  dcNo?: string;
  component?: string;
  material?: string;
};

export const WEIGHT_FILTER_KEYS = [
  "q",
  "from",
  "to",
  "state",
  "customer",
  "dcNo",
  "component",
  "material",
] as const;

export type WeightStateFilter = "pending" | "completed" | "notConfigured" | "sentChanged";

export function weightStateFilter(value: string | undefined): WeightStateFilter | null {
  return value === "pending" ||
    value === "completed" ||
    value === "notConfigured" ||
    value === "sentChanged"
    ? value
    : null;
}

function matchesState(line: WeightLine, state: WeightStateFilter | null): boolean {
  if (!state) return true;
  if (state === "pending") return line.status === "pending" || line.status === "notConfigured";
  if (state === "completed") return line.status === "recorded" || line.status === "sentChanged";
  return line.status === state;
}

function contains(value: string | null | undefined, needle: string): boolean {
  return (value ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

/** Lines matching the filters. Dates are our DC dates, both ends included. */
export function filterWeightLines(lines: WeightLine[], filters: WeightFilterValues): WeightLine[] {
  const state = weightStateFilter(filters.state);
  return lines.filter(
    (line) =>
      matchesState(line, state) &&
      (!filters.from || line.dcDate >= filters.from) &&
      (!filters.to || line.dcDate <= filters.to) &&
      (!filters.customer || line.customerName === filters.customer) &&
      (!filters.component || line.component === filters.component) &&
      (!filters.material ||
        (line.material ?? "").trim().toLowerCase() === filters.material.trim().toLowerCase()) &&
      (!filters.dcNo?.trim() || contains(line.dcNumber, filters.dcNo)) &&
      (!filters.q ||
        matchesTerm(filters.q, [
          line.dcNumber,
          line.customerName,
          line.component,
          line.material,
          line.sentQty,
        ]))
  );
}

export type WeightTotals = {
  lines: number;
  recordedLines: number;
  pendingLines: number;
  notConfiguredLines: number;
  sentChangedLines: number;
  /** Sent pieces the recorded totals use. */
  recordedQty: number;
  totalScrapMg: number;
  totalValuePaise: number;
};

/** Totals of what has been recorded, as recorded. Pending lines add nothing. */
export function summarizeWeightLines(lines: WeightLine[]): WeightTotals {
  const totals: WeightTotals = {
    lines: lines.length,
    recordedLines: 0,
    pendingLines: 0,
    notConfiguredLines: 0,
    sentChangedLines: 0,
    recordedQty: 0,
    totalScrapMg: 0,
    totalValuePaise: 0,
  };
  let qtyHundredths = 0;
  for (const line of lines) {
    if (line.status === "pending") totals.pendingLines += 1;
    if (line.status === "notConfigured") totals.notConfiguredLines += 1;
    if (line.status === "sentChanged") totals.sentChangedLines += 1;
    if (!line.recorded) continue;
    totals.recordedLines += 1;
    qtyHundredths += Math.round(line.recorded.sentQty * 100);
    totals.totalScrapMg += line.recorded.totalScrapMg;
    totals.totalValuePaise += line.recorded.valuePaise;
  }
  totals.recordedQty = qtyHundredths / 100;
  return totals;
}

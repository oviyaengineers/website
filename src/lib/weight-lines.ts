import type { DcLifecycle } from "@/lib/dc-lifecycle";
import { matchesTerm } from "@/lib/dc-search";
import { weightStatus, type WeightStatus } from "@/lib/weight";
import type { DcLineWeightRow } from "@/types/database";

/**
 * One delivery challan line as the Weight / Scrap screens show it.
 *
 * Every line is its own row, with its own Sent Qty exactly as stored on that
 * line. A follow-up DC's line is a row of its own too: its pieces went out on
 * that document, so its weight belongs there, and nothing is added up across
 * DCs.
 */
export type WeightLine = {
  itemId: string;
  dcId: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  component: string;
  material: string | null;
  /** This line's own Sent Qty, read from the challan. Never entered here. */
  sentQty: number;
  sortOrder: number;
  /** The DC this line continues, for a follow-up line. */
  followUpOf: string | null;
  dcLifecycle: DcLifecycle;
  weight: DcLineWeightRow | null;
  status: WeightStatus;
};

export type WeightFilterValues = {
  q?: string;
  from?: string;
  to?: string;
  /** DC status: completed (the default), active, or all. */
  dc?: string;
  /** Weight status, or blank for every line. */
  weight?: string;
  customer?: string;
  dcNo?: string;
  customerDcNo?: string;
  component?: string;
  material?: string;
};

export type DcStatusFilter = "completed" | "active" | "all";

export function dcStatusFilter(value: string | undefined): DcStatusFilter {
  return value === "active" || value === "all" ? value : "completed";
}

const WEIGHT_STATUSES: readonly WeightStatus[] = [
  "notWeighed",
  "rateMissing",
  "weighed",
  "sentChanged",
];

export function isWeightStatus(value: string | undefined): value is WeightStatus {
  return WEIGHT_STATUSES.includes(value as WeightStatus);
}

function contains(value: string | null | undefined, needle: string): boolean {
  return (value ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

/** Lines matching the filters. Dates are our DC dates, both ends included. */
export function filterWeightLines(lines: WeightLine[], filters: WeightFilterValues): WeightLine[] {
  const dc = dcStatusFilter(filters.dc);
  const weight = isWeightStatus(filters.weight) ? filters.weight : null;
  return lines.filter(
    (line) =>
      (dc === "all" || line.dcLifecycle === dc) &&
      (!weight || line.status === weight) &&
      (!filters.from || line.dcDate >= filters.from) &&
      (!filters.to || line.dcDate <= filters.to) &&
      (!filters.customer || line.customerName === filters.customer) &&
      (!filters.component || line.component === filters.component) &&
      (!filters.material ||
        (line.material ?? "").toLowerCase() === filters.material.toLowerCase()) &&
      (!filters.dcNo?.trim() || contains(line.dcNumber, filters.dcNo)) &&
      (!filters.customerDcNo?.trim() ||
        line.customerDcNumbers.some((ref) => contains(ref, filters.customerDcNo!))) &&
      (!filters.q ||
        matchesTerm(filters.q, [
          line.dcNumber,
          line.customerName,
          line.component,
          line.material,
          line.sentQty,
          line.followUpOf,
          ...line.customerDcNumbers,
        ]))
  );
}

/** The line's status from its stored weight and current Sent Qty. */
export function lineStatus(weight: DcLineWeightRow | null, sentQty: number): WeightStatus {
  return weightStatus(weight, sentQty);
}

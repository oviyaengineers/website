import { normalizeDcStatus } from "@/lib/dc-lifecycle";

// Combined DC Print: several of our delivery challans for ONE customer on ONE
// Our DC Date, printed together on one A4 sheet for the customer.
//
// Print only. Every challan stays its own record with its own number, lines,
// balance, follow-ups and QR link; nothing here writes anything. These helpers
// decide what may be printed together and how the lines are laid out, so the
// same rules apply on the selection screen and on the print page.

/** Up to this many source DCs get their own labelled QR code on the sheet. */
export const QR_MAX_SOURCE_DCS = 3;

/** Up to this many lines, a combined print always uses the half-page layout. */
export const NORMAL_MAX_LINES = 3;

/**
 * Most item lines that fit safely in each half of one A4 page (ORIGINAL above
 * DUPLICATE) in the combined layout, measured in the browser in English and
 * Tamil. The print page also measures the real sheet and blocks printing if
 * anything would still be cut off, for example by very long descriptions.
 */
export const MAX_HALF_LINES = 8;

/** Most item lines that fit on a full A4 page per copy, measured the same way. */
export const MAX_FULL_LINES = 20;

/**
 * half: ORIGINAL and DUPLICATE on the same A4 page.
 * full: ORIGINAL on one full A4 page, DUPLICATE on the next.
 */
export type CombinedLayout = "half" | "full";

/** Which layouts a combined print with this many lines may use. */
export function combinedLayoutOptions(lineCount: number): {
  /** More than the normal three lines: the operator chooses the layout. */
  choose: boolean;
  halfFits: boolean;
  fullFits: boolean;
  defaultLayout: CombinedLayout;
} {
  const choose = lineCount > NORMAL_MAX_LINES;
  return {
    choose,
    halfFits: lineCount <= MAX_HALF_LINES,
    fullFits: lineCount <= MAX_FULL_LINES,
    defaultLayout: choose ? "full" : "half",
  };
}

/**
 * The layout actually used. Three lines or fewer are always the half page; a
 * longer print gets the half page only when asked for and it can fit, and
 * full pages otherwise.
 */
export function resolveCombinedLayout(
  requested: string | undefined,
  lineCount: number
): CombinedLayout {
  const options = combinedLayoutOptions(lineCount);
  if (!options.choose) return "half";
  return requested === "half" && options.halfFits ? "half" : "full";
}

export type CombinedDc = {
  id: string;
  dc_number: string;
  dc_date: string;
  customer_id: string;
  status: string;
  customer_dc_number: string[] | null;
};

export type CombinedLine = {
  id: string;
  dc_id: string;
  sort_order: number;
  component: string;
  component_id: string | null;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  total_qty: number;
};

export type CombinedRow = CombinedLine & {
  /** Our DC number this line is on. */
  dcNumber: string;
  /** The customer's DC numbers recorded on that same DC. */
  customerDcNumbers: string[];
};

/** Why a set of DCs cannot be printed together, or null when it can. */
export type CombinedSelectionProblem = "none" | "missing" | "draft" | "customers" | "dates";

export function isDraftDc(dc: Pick<CombinedDc, "status">): boolean {
  return normalizeDcStatus(dc.status) === "draft";
}

/**
 * Checks a requested set of DCs: all must exist, none may be a draft, and all
 * must share one customer and one Our DC Date. Different customers or dates
 * are never combined, whatever was asked for.
 */
export function checkCombinedSelection(
  wantedIds: string[],
  found: Pick<CombinedDc, "id" | "customer_id" | "dc_date" | "status">[]
): CombinedSelectionProblem | null {
  const wanted = [...new Set(wantedIds)];
  if (wanted.length === 0) return "none";
  const byId = new Map(found.map((dc) => [dc.id, dc]));
  const selected = wanted.map((id) => byId.get(id));
  if (selected.some((dc) => !dc)) return "missing";
  const dcs = selected as Pick<CombinedDc, "id" | "customer_id" | "dc_date" | "status">[];
  if (dcs.some(isDraftDc)) return "draft";
  if (new Set(dcs.map((dc) => dc.customer_id)).size > 1) return "customers";
  if (new Set(dcs.map((dc) => dc.dc_date)).size > 1) return "dates";
  return null;
}

/** A line is printed only when something moved on it, as on a single DC print. */
export function lineMoved(
  line: Pick<CombinedLine, "sent_qty" | "material_problem_qty" | "rejection_qty">
): boolean {
  return (
    (Number(line.sent_qty) || 0) +
      (Number(line.material_problem_qty) || 0) +
      (Number(line.rejection_qty) || 0) >
    0
  );
}

/**
 * The printed rows: one per source DC line, never grouped, in DC number order
 * and then each DC's own line order. Quantities are passed through as stored.
 */
export function combinedRows(
  dcs: CombinedDc[],
  lines: CombinedLine[],
  nameOf: (line: CombinedLine) => string = (line) => line.component
): CombinedRow[] {
  const ordered = [...dcs].sort((a, b) => a.dc_number.localeCompare(b.dc_number));
  return ordered.flatMap((dc) =>
    lines
      .filter((line) => line.dc_id === dc.id && lineMoved(line))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        ...line,
        component: nameOf(line),
        dcNumber: dc.dc_number,
        customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean),
      }))
  );
}

/** Labelled QR codes for a few DCs; a plain Source DCs list beyond that. */
export function combinedQrMode(dcCount: number): "qr" | "list" {
  return dcCount <= QR_MAX_SOURCE_DCS ? "qr" : "list";
}

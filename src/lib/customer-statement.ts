import { componentNameOf } from "@/lib/dc-components";
import { normalizeDcStatus } from "@/lib/dc-lifecycle";
import { roundMoney } from "@/lib/billing";
import type { DeliveryChallanItemRow, DeliveryChallanRow } from "@/types/database";

/**
 * Customer Statement: one customer's work over a period, as a report.
 *
 * One row per line of every issued (non-draft) Our DC of the customer dated
 * inside the period, both dates included. A follow-up DC is its own row,
 * never folded into the DC it continues, so every Our DC stays traceable to
 * the customer DC it came from.
 *
 * Quantities are the DC lines' own, as stored:
 * - Received is on the original line only. A follow-up line carries none by
 *   design (the pieces were received once), so its row shows the DC it
 *   follows instead, and nothing is counted twice.
 * - Completed is the line's own Sent quantity, the same quantity Billing
 *   bills. Material Problem and Rejection are not completed work.
 *
 * The rate is the Rate List's, for the line's component and material, looked
 * up exactly as Billing does. With no rate the row says so and has no value;
 * nothing is guessed. Read only: this computes, it never writes.
 */

export type StatementDc = Pick<
  DeliveryChallanRow,
  "id" | "dc_number" | "dc_date" | "status" | "customer_dc_number" | "customer_dc_date"
>;
export type StatementItem = Pick<
  DeliveryChallanItemRow,
  | "id"
  | "dc_id"
  | "parent_item_id"
  | "component_id"
  | "component"
  | "material"
  | "received_qty"
  | "sent_qty"
  | "sort_order"
>;
export type StatementRate = { component_id: string; material: string; rate: number | string };

export type StatementRow = {
  key: string;
  /** Our DC. */
  dcNumber: string;
  dcDate: string;
  /** The customer's references on that DC, each with its date when known. */
  customerDcs: { number: string; date: string | null }[];
  component: string;
  material: string | null;
  /** Received on this line; null on a follow-up line, which receives nothing. */
  received: number | null;
  /** The Our DC this line follows up, when it is a follow-up. */
  followUpOf: string | null;
  completed: number;
  /** Rate List rate per piece; null when the list has none for this line. */
  rate: number | null;
  /** Completed x rate; null when there is no rate. */
  value: number | null;
};

export type Statement = {
  rows: StatementRow[];
  totalCompleted: number;
  grandTotal: number;
  /** Rows with completed pieces but no rate, so their value is missing from the total. */
  withoutRate: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A valid YYYY-MM-DD date, or null. */
export function statementDate(value: string | null | undefined): string | null {
  if (!value || !DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function buildStatement({
  dcs,
  items,
  rates,
  componentNames,
  from,
  to,
}: {
  /** Every DC of the customer, any date, so a follow-up can name the DC it follows. */
  dcs: StatementDc[];
  items: StatementItem[];
  rates: StatementRate[];
  componentNames: Map<string, string>;
  /** Inclusive, YYYY-MM-DD, compared with the Our DC date. */
  from: string;
  to: string;
}): Statement {
  const dcById = new Map(dcs.map((dc) => [dc.id, dc]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rateByKey = new Map(rates.map((r) => [`${r.component_id}|${r.material}`, Number(r.rate)]));

  const rows: StatementRow[] = [];
  for (const item of items) {
    const dc = dcById.get(item.dc_id);
    if (!dc) continue;
    if (normalizeDcStatus(dc.status) === "draft") continue;
    const dcDate = dc.dc_date.slice(0, 10);
    if (dcDate < from || dcDate > to) continue;

    const parent = item.parent_item_id ? itemById.get(item.parent_item_id) : undefined;
    const followUpOf = item.parent_item_id
      ? (dcById.get(parent?.dc_id ?? "")?.dc_number ?? "an earlier DC")
      : null;
    const completed = Number(item.sent_qty) || 0;
    const listed = item.component_id
      ? rateByKey.get(`${item.component_id}|${item.material ?? ""}`)
      : undefined;
    const rate = listed !== undefined && Number.isFinite(listed) ? listed : null;
    const dates = dc.customer_dc_date ?? [];

    rows.push({
      key: item.id,
      dcNumber: dc.dc_number,
      dcDate,
      customerDcs: (dc.customer_dc_number ?? [])
        .map((number, i) => ({ number: (number ?? "").trim(), date: dates[i] ?? null }))
        .filter((ref) => ref.number !== ""),
      component: componentNameOf(item, componentNames),
      material: item.material,
      received: followUpOf === null ? Number(item.received_qty) || 0 : null,
      followUpOf,
      completed,
      rate,
      value: rate === null ? null : roundMoney(completed * rate),
    });
  }

  const sortOrder = new Map(items.map((item) => [item.id, item.sort_order ?? 0]));
  rows.sort(
    (a, b) =>
      a.dcDate.localeCompare(b.dcDate) ||
      natural.compare(
        a.customerDcs.map((r) => r.number).join(", "),
        b.customerDcs.map((r) => r.number).join(", ")
      ) ||
      natural.compare(a.dcNumber, b.dcNumber) ||
      (sortOrder.get(a.key) ?? 0) - (sortOrder.get(b.key) ?? 0)
  );

  return {
    rows,
    totalCompleted: rows.reduce((sum, row) => sum + row.completed, 0),
    grandTotal: roundMoney(rows.reduce((sum, row) => sum + (row.value ?? 0), 0)),
    withoutRate: rows.filter((row) => row.rate === null && row.completed > 0).length,
  };
}

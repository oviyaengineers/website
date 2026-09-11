import { createClient } from "@/lib/supabase/server";
import { balanceQty, outwardTotal } from "@/lib/dc-balance";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { dcLifecycle, type DcLifecycle } from "@/lib/dc-lifecycle";
import type { DeliveryChallanItemRow } from "@/types/database";

export type DcListFilters = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/** One challan with its items and the totals every screen wants from it. */
export type DcSummary = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  customerDcDates: (string | null)[];
  authorizedBy: string | null;
  lifecycle: DcLifecycle;
  items: DeliveryChallanItemRow[];
  received: number;
  sent: number;
  materialProblem: number;
  rejection: number;
  /** Received less everything accounted back: what is still on our floor. */
  balance: number;
};

function sum(items: DeliveryChallanItemRow[], pick: (i: DeliveryChallanItemRow) => number): number {
  return items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
}

/**
 * Challans matching the filters, newest first, each with its item rows.
 *
 * One function for the list screen and its print view, so the printed sheet
 * cannot show a different set of challans from the one on screen.
 *
 * Date and status are narrowed in Postgres; the text search and the component
 * filter are applied here, because both have to look inside the item rows and
 * the customer name rather than at the challan row alone.
 */
export async function fetchDcSummaries(filters: DcListFilters): Promise<DcSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("delivery_challans")
    .select("*")
    .order("dc_date", { ascending: false })
    .order("dc_number", { ascending: false });

  if (filters.from) query = query.gte("dc_date", filters.from);
  if (filters.to) query = query.lte("dc_date", filters.to);

  const [{ data: dcs }, { data: customers }, { data: picklist }] = await Promise.all([
    query,
    supabase.from("customers").select("id, name"),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);

  const challans = dcs ?? [];
  if (challans.length === 0) return [];

  const { data: items } = await supabase
    .from("delivery_challan_items")
    .select("*")
    .in(
      "dc_id",
      challans.map((dc) => dc.id)
    )
    .order("sort_order");

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // Each row is given the master list's current spelling of its part, so the
  // component filter, the search and every printed sheet agree with Settings
  // without a challan ever being rewritten.
  const componentNames = componentNameIndex(picklist ?? []);
  const itemsByDc = new Map<string, DeliveryChallanItemRow[]>();
  for (const row of items ?? []) {
    const item = { ...row, component: componentNameOf(row, componentNames) };
    const list = itemsByDc.get(item.dc_id);
    if (list) list.push(item);
    else itemsByDc.set(item.dc_id, [item]);
  }

  let summaries: DcSummary[] = challans.map((dc) => {
    const rows = itemsByDc.get(dc.id) ?? [];
    return {
      id: dc.id,
      dcNumber: dc.dc_number,
      dcDate: dc.dc_date,
      customerName: nameById.get(dc.customer_id) ?? "-",
      customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
      customerDcDates: dc.customer_dc_date ?? [],
      authorizedBy: dc.authorized_by,
      lifecycle: dcLifecycle(dc.status, rows),
      items: rows,
      received: sum(rows, (i) => i.received_qty),
      sent: sum(rows, (i) => i.sent_qty),
      materialProblem: sum(rows, (i) => i.material_problem_qty),
      rejection: sum(rows, (i) => i.rejection_qty),
      balance: rows.reduce((total, item) => total + balanceQty(item), 0),
    };
  });

  if (filters.status) {
    summaries = summaries.filter((dc) => dc.lifecycle === filters.status);
  }

  if (filters.component) {
    const wanted = filters.component.trim().toLowerCase();
    summaries = summaries.filter((dc) =>
      dc.items.some((item) => item.component.trim().toLowerCase() === wanted)
    );
  }

  if (filters.q) {
    // Searches our number, the customer, their own reference and the parts on
    // the challan — the four things anybody has to hand when looking one up.
    const needle = filters.q.trim().toLowerCase();
    summaries = summaries.filter((dc) =>
      [
        dc.dcNumber,
        dc.customerName,
        ...dc.customerDcNumbers,
        ...dc.items.map((item) => item.component),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }

  return summaries;
}

/** Column totals across a filtered list, for the foot of a table or a print. */
export function totalDcSummaries(summaries: DcSummary[]) {
  return {
    received: summaries.reduce((total, dc) => total + dc.received, 0),
    sent: summaries.reduce((total, dc) => total + dc.sent, 0),
    materialProblem: summaries.reduce((total, dc) => total + dc.materialProblem, 0),
    rejection: summaries.reduce((total, dc) => total + dc.rejection, 0),
    balance: summaries.reduce((total, dc) => total + dc.balance, 0),
  };
}

/** Everything accounted back to the customer on one challan. */
export function outwardOf(summary: DcSummary): number {
  return summary.items.reduce((total, item) => total + outwardTotal(item), 0);
}

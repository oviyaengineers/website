import { createClient } from "@/lib/supabase/server";
import { challanSettledIn, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { dcLifecycle, type DcLifecycle } from "@/lib/dc-lifecycle";
import { lineStatus, type WeightLine } from "@/lib/weight-lines";
import type { DcLineWeightRow } from "@/types/database";

/**
 * Read-only loading for the Weight / Scrap screens.
 *
 * Challans, lines and quantities are read exactly as stored and never written.
 * The DC's Completed/Active status comes from the same chain calculation every
 * other screen uses, so it always agrees with the DC list.
 */

type Challan = {
  id: string;
  dc_number: string;
  dc_date: string;
  customer_id: string;
  customer_dc_number: string[] | null;
  status: string;
};

async function load() {
  const supabase = await createClient();
  const [chainRows, { data: dcs }, { data: customers }, { data: picklist }, { data: weights }] =
    await Promise.all([
      fetchChainRows(supabase),
      supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, customer_id, customer_dc_number, status")
        .order("dc_date", { ascending: false })
        .order("dc_number", { ascending: false }),
      supabase.from("customers").select("id, name"),
      supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
      supabase.from("dc_line_weights").select("*"),
    ]);
  return {
    chainRows,
    dcs: (dcs ?? []) as Challan[],
    customers: customers ?? [],
    picklist: picklist ?? [],
    weights: (weights ?? []) as DcLineWeightRow[],
  };
}

function build(data: Awaited<ReturnType<typeof load>>, onlyDcId?: string) {
  const chain = indexChain(data.chainRows);
  const customerById = new Map(data.customers.map((c) => [c.id, c.name]));
  const componentNames = componentNameIndex(data.picklist);
  const weightByItem = new Map(data.weights.map((w) => [w.dc_item_id, w]));
  const numberByItem = new Map(data.chainRows.map((row) => [row.id, row.dc_number ?? null]));
  const rowsByDc = new Map<string, typeof data.chainRows>();
  for (const row of data.chainRows) {
    const list = rowsByDc.get(row.dc_id) ?? [];
    list.push(row);
    rowsByDc.set(row.dc_id, list);
  }

  const challans: { dc: Challan; lifecycle: DcLifecycle; lines: WeightLine[] }[] = [];
  for (const dc of data.dcs) {
    if (onlyDcId && dc.id !== onlyDcId) continue;
    const rows = (rowsByDc.get(dc.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const lifecycle = dcLifecycle(dc.status, rows, challanSettledIn(rows, chain));
    const lines = rows.map((row): WeightLine => {
      const sentQty = Number(row.sent_qty) || 0;
      const weight = weightByItem.get(row.id) ?? null;
      return {
        itemId: row.id,
        dcId: dc.id,
        dcNumber: dc.dc_number,
        dcDate: dc.dc_date,
        customerName: customerById.get(dc.customer_id) ?? "-",
        customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
        component: componentNameOf(row, componentNames),
        material: row.material,
        sentQty,
        sortOrder: row.sort_order,
        followUpOf: row.parent_item_id ? (numberByItem.get(row.parent_item_id) ?? null) : null,
        dcLifecycle: lifecycle,
        weight,
        status: lineStatus(weight, sentQty),
      };
    });
    challans.push({ dc, lifecycle, lines });
  }
  return { challans, customerById };
}

/** Every line on every issued (non-draft) DC, newest DC first. */
export async function fetchWeightLines(): Promise<WeightLine[]> {
  const { challans } = build(await load());
  return challans.filter((c) => c.lifecycle !== "draft").flatMap((c) => c.lines);
}

export type WeightDc = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  lifecycle: DcLifecycle;
  lines: WeightLine[];
};

/** One DC with all of its lines, draft or not, or null when it does not exist. */
export async function fetchWeightDc(dcId: string): Promise<WeightDc | null> {
  const { challans, customerById } = build(await load(), dcId);
  const found = challans[0];
  if (!found) return null;
  return {
    id: found.dc.id,
    dcNumber: found.dc.dc_number,
    dcDate: found.dc.dc_date,
    customerName: customerById.get(found.dc.customer_id) ?? "-",
    customerDcNumbers: (found.dc.customer_dc_number ?? []).filter(Boolean) as string[],
    lifecycle: found.lifecycle,
    lines: found.lines,
  };
}

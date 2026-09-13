"use server";

import { createClient } from "@/lib/supabase/server";
import { figuresFor, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { normalizeDcStatus } from "@/lib/dc-lifecycle";
import type { DeliveryChallanItemRow } from "@/types/database";

/** A pending line, with everything needed to raise the next challan for it. */
export type PendingLine = {
  itemId: string;
  dcId: string;
  dcNumber: string;
  customerId: string;
  customerName: string;
  customerDcNumber: string;
  customerDcDate: string | null;
  component: string;
  componentId: string | null;
  material: string | null;
  received: number;
  /** What is still owed, counting confirmed despatches already made against this line. */
  remaining: number;
  /** Quantity already on draft follow-ups against this line, not yet counted. */
  onDraft: number;
  /** What this follow-up may carry: the balance less what drafts have booked. */
  bookable: number;
};

/**
 * The line a "Create Follow-up DC" button is continuing.
 *
 * Read fresh every time the form opens, because the remaining balance moves
 * whenever anybody despatches against the same lot, and the figure shown has
 * to be the one the save will be judged against. It comes from the same chain
 * calculation as every screen, so the form and the lists agree.
 */
export async function getPendingLine(itemId: string): Promise<PendingLine | null> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("delivery_challan_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.parent_item_id) return null;

  const [chainRows, { data: dc }] = await Promise.all([
    fetchChainRows(supabase),
    supabase
      .from("delivery_challans")
      .select("id, dc_number, customer_id, customer_dc_number, customer_dc_date")
      .eq("id", item.dc_id)
      .maybeSingle(),
  ]);
  if (!dc) return null;

  const { data: customer } = await supabase
    .from("customers")
    .select("name")
    .eq("id", dc.customer_id)
    .maybeSingle();

  const figures = figuresFor(item, indexChain(chainRows));

  return {
    itemId: item.id,
    dcId: dc.id,
    dcNumber: dc.dc_number,
    customerId: dc.customer_id,
    customerName: customer?.name ?? "-",
    customerDcNumber: (dc.customer_dc_number ?? []).filter(Boolean)[0] ?? "",
    customerDcDate: (dc.customer_dc_date ?? []).filter(Boolean)[0] ?? null,
    component: item.component,
    componentId: item.component_id,
    material: item.material,
    received: figures.received,
    remaining: figures.balance ?? 0,
    onDraft: figures.onDraft,
    bookable: figures.bookable,
  };
}

/** Every follow-up challan raised against a given one, oldest first. */
export type RelatedDc = {
  dcId: string;
  dcNumber: string;
  dcDate: string;
  itemId: string;
  component: string;
  material: string | null;
  sent: number;
  materialProblem: number;
  rejection: number;
  draft: boolean;
  /** The original line this follow-up despatches against. */
  rootItemId: string | null;
  /**
   * What was left on the original line once this follow-up and every earlier
   * confirmed one had gone out, in date and DC-number order. A draft does not
   * reduce it, so it shows the figure it leaves in place.
   */
  remainingAfter: number | null;
};

/**
 * Every line descending from the given ones, however many steps down.
 *
 * Reads a generation at a time and stops when a generation adds nothing new,
 * so a cycle in the data ends the walk rather than hanging it.
 */
async function descendantsOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rootIds: string[]
): Promise<DeliveryChallanItemRow[]> {
  const found = new Map<string, DeliveryChallanItemRow>();
  let frontier = rootIds;

  while (frontier.length > 0) {
    const { data } = await supabase
      .from("delivery_challan_items")
      .select("*")
      .in("parent_item_id", frontier);

    const fresh = (data ?? []).filter((row) => !found.has(row.id));
    for (const row of fresh) found.set(row.id, row);
    frontier = fresh.map((row) => row.id);
  }

  return [...found.values()];
}

export async function listRelatedDcs(dcId: string): Promise<RelatedDc[]> {
  const supabase = await createClient();

  const { data: ownItems } = await supabase
    .from("delivery_challan_items")
    .select("id")
    .eq("dc_id", dcId);
  const ids = (ownItems ?? []).map((row) => row.id);
  if (ids.length === 0) return [];

  // The whole chain, not just the first step. A follow-up can itself be
  // followed up, and every one of those despatches work that belongs to this
  // challan, so all of them are part of its history.
  const children = await descendantsOf(supabase, ids);
  if (children.length === 0) return [];

  const [{ data: challans }, chainRows] = await Promise.all([
    supabase
      .from("delivery_challans")
      .select("id, dc_number, dc_date, status")
      .in("id", [...new Set(children.map((row) => row.dc_id))]),
    fetchChainRows(supabase),
  ]);
  const chain = indexChain(chainRows);
  const byId = new Map((challans ?? []).map((dc) => [dc.id, dc]));

  const rows = children
    .map((row) => {
      const dc = byId.get(row.dc_id);
      return {
        dcId: row.dc_id,
        dcNumber: dc?.dc_number ?? "-",
        dcDate: dc?.dc_date ?? "",
        itemId: row.id,
        component: row.component,
        material: row.material,
        sent: Number(row.sent_qty) || 0,
        materialProblem: Number(row.material_problem_qty) || 0,
        rejection: Number(row.rejection_qty) || 0,
        draft: normalizeDcStatus(dc?.status) === "draft",
        rootItemId: chain.rootOf.get(row.id) ?? null,
        remainingAfter: null as number | null,
      };
    })
    .sort(
      (a, b) =>
        a.dcDate.localeCompare(b.dcDate) ||
        a.dcNumber.localeCompare(b.dcNumber, undefined, { numeric: true })
    );

  // Running balance per original line: its received less its own outward,
  // then each confirmed follow-up in turn. Read from the chain rows, so it
  // ends exactly where the balance shown everywhere else ends.
  const running = new Map<string, number>();
  for (const row of rows) {
    if (!row.rootItemId) continue;
    const root = chain.rows.get(row.rootItemId);
    if (!root) continue;
    if (!running.has(row.rootItemId)) {
      const own =
        (Number(root.sent_qty) || 0) +
        (Number(root.material_problem_qty) || 0) +
        (Number(root.rejection_qty) || 0);
      running.set(row.rootItemId, (Number(root.received_qty) || 0) - own);
    }
    const left = running.get(row.rootItemId) ?? 0;
    const next = row.draft ? left : left - row.sent - row.materialProblem - row.rejection;
    running.set(row.rootItemId, next);
    row.remainingAfter = next;
  }

  return rows;
}

import type { createClient } from "@/lib/supabase/server";
import { normalizeDcStatus } from "@/lib/dc-lifecycle";
import type { DeliveryChallanItemRow } from "@/types/database";

/**
 * Every challan line, marked with whether its challan is still a draft.
 *
 * The chain arithmetic needs that mark on each line, because a follow-up in
 * draft must not reduce the balance of the line it continues. Loading the
 * lines here, in one place, is what keeps every screen feeding the same set
 * into the same calculation.
 */

export type ChainRow = DeliveryChallanItemRow & { draft: boolean };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Mark lines already in hand, given each challan's stored status. */
export function withDraftFlags<T extends { dc_id: string }>(
  items: T[],
  statusByDc: Map<string, string | null | undefined>
): (T & { draft: boolean })[] {
  return items.map((item) => ({
    ...item,
    draft: normalizeDcStatus(statusByDc.get(item.dc_id)) === "draft",
  }));
}

/** Every line on file, marked, for any balance that has to see the whole chain. */
export async function fetchChainRows(supabase: Supabase): Promise<ChainRow[]> {
  const [{ data: items }, { data: challans }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*"),
    supabase.from("delivery_challans").select("id, status"),
  ]);
  const statusByDc = new Map((challans ?? []).map((dc) => [dc.id, dc.status]));
  return withDraftFlags(items ?? [], statusByDc);
}

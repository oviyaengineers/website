import { createClient } from "@/lib/supabase/server";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { buildHistory, type HistoryFilters, type HistoryResult } from "@/lib/dc-history";

/**
 * The DC history for a set of filters, read from the master records.
 *
 * Reads only. Challans, their lines and the scan queue are loaded whole
 * because a line's balance depends on despatches made on other challans, which
 * may fall outside the date range being viewed; the range narrows the rows
 * shown, never the figures behind them.
 */
export async function fetchDcHistory(filters: HistoryFilters): Promise<
  HistoryResult & {
    customerNames: string[];
    componentNames: string[];
  }
> {
  const supabase = await createClient();

  const [{ data: challans }, chainRows, { data: scans }, { data: customers }, { data: picklist }] =
    await Promise.all([
      supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, customer_id, customer_dc_number, status, created_at"),
      fetchChainRows(supabase),
      supabase
        .from("pending_dc_scans")
        .select("id, customer_id, customer_dc_number, customer_dc_date, items, status, created_at")
        .eq("status", "pending"),
      supabase.from("customers").select("id, name").order("name"),
      supabase
        .from("dc_picklist_items")
        .select("id, name, kind")
        .eq("kind", "component")
        .order("name"),
    ]);

  // Each line carries the master list's current spelling of its part, as on
  // every other screen, so the component filter agrees with Settings.
  const names = componentNameIndex(picklist ?? []);
  const result = buildHistory(
    {
      challans: challans ?? [],
      chainRows: chainRows.map((row) => ({ ...row, component: componentNameOf(row, names) })),
      scans: scans ?? [],
      customers: customers ?? [],
    },
    filters
  );

  return {
    ...result,
    customerNames: (customers ?? []).map((c) => c.name),
    componentNames: (picklist ?? []).map((item) => item.name),
  };
}

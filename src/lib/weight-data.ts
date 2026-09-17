import { createClient } from "@/lib/supabase/server";
import { challanSettledIn, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { dcLifecycle, type DcLifecycle } from "@/lib/dc-lifecycle";
import { weightLineFromRow, type WeightLine } from "@/lib/weight-lines";
import type { DcWeightLineRow, WeightMasterRow } from "@/types/database";

/**
 * Read-only loading for the Weight / Scrap screens.
 *
 * Lines come from the dc_weight_lines view (0031): every line of every
 * non-draft DC, with its recorded result or the active master it would use.
 * Challans, lines and quantities are read exactly as stored and never written.
 */

/** Every line on every non-draft DC, newest DC first. */
export async function fetchWeightLines(): Promise<WeightLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dc_weight_lines")
    .select("*")
    .order("dc_date", { ascending: false })
    .order("dc_number", { ascending: false })
    .order("sort_order", { ascending: true });
  return ((data ?? []) as DcWeightLineRow[]).map(weightLineFromRow);
}

export type WeightDc = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  lifecycle: DcLifecycle;
  isDraft: boolean;
  lines: WeightLine[];
};

/** One DC with its weight lines, or null when it does not exist. */
export async function fetchWeightDc(dcId: string): Promise<WeightDc | null> {
  const supabase = await createClient();
  const { data: dc } = await supabase
    .from("delivery_challans")
    .select("id, dc_number, dc_date, customer_id, customer_dc_number, status")
    .eq("id", dcId)
    .maybeSingle();
  if (!dc) return null;

  const [{ data: customer }, { data: rows }, chainRows] = await Promise.all([
    supabase.from("customers").select("name").eq("id", dc.customer_id).maybeSingle(),
    supabase.from("dc_weight_lines").select("*").eq("dc_id", dcId).order("sort_order"),
    fetchChainRows(supabase),
  ]);
  const ownRows = chainRows.filter((row) => row.dc_id === dcId);
  const lifecycle = dcLifecycle(
    String(dc.status),
    ownRows,
    challanSettledIn(ownRows, indexChain(chainRows))
  );

  return {
    id: dc.id,
    dcNumber: dc.dc_number,
    dcDate: dc.dc_date,
    customerName: customer?.name ?? "-",
    customerDcNumbers: ((dc.customer_dc_number ?? []) as (string | null)[]).filter(
      Boolean
    ) as string[],
    lifecycle,
    isDraft: String(dc.status) === "draft",
    lines: ((rows ?? []) as DcWeightLineRow[]).map(weightLineFromRow),
  };
}

export type WeightMasterItem = {
  id: string;
  componentId: string;
  componentName: string;
  material: string;
  unit: "g" | "kg";
  roughG: number;
  finishedG: number;
  scrapG: number;
  isActive: boolean;
  /** Recorded DC lines that used it; a used master can only be made inactive. */
  usedBy: number;
  updatedAt: string;
};

/** The Weight Master with component names and how often each record was used. */
export async function fetchWeightMaster(): Promise<{
  items: WeightMasterItem[];
  components: { id: string; name: string }[];
  materials: string[];
}> {
  const supabase = await createClient();
  const [{ data: masters }, { data: picklist }, { data: used }] = await Promise.all([
    supabase.from("weight_master").select("*"),
    supabase.from("dc_picklist_items").select("id, name, kind").order("name"),
    supabase.from("dc_line_weights").select("weight_master_id"),
  ]);
  const components = (picklist ?? [])
    .filter((p) => p.kind === "component")
    .map((p) => ({ id: p.id, name: p.name }));
  const materials = (picklist ?? []).filter((p) => p.kind === "material").map((p) => p.name);
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const usedCount = new Map<string, number>();
  for (const row of (used ?? []) as { weight_master_id: string }[]) {
    usedCount.set(row.weight_master_id, (usedCount.get(row.weight_master_id) ?? 0) + 1);
  }
  const items = ((masters ?? []) as WeightMasterRow[])
    .map((m): WeightMasterItem => ({
      id: m.id,
      componentId: m.component_id,
      componentName: nameById.get(m.component_id) ?? "(removed component)",
      material: m.material,
      unit: m.unit,
      roughG: Number(m.rough_weight_g),
      finishedG: Number(m.finished_weight_g),
      scrapG: Number(m.scrap_weight_g),
      isActive: m.is_active,
      usedBy: usedCount.get(m.id) ?? 0,
      updatedAt: m.updated_at,
    }))
    .sort(
      (a, b) =>
        a.componentName.localeCompare(b.componentName) || a.material.localeCompare(b.material)
    );
  return { items, components, materials };
}

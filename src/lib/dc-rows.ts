import { createClient } from "@/lib/supabase/server";
import { balanceQty, outwardTotal } from "@/lib/dc-balance";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";

/**
 * One item line, flattened with the challan and customer it belongs to.
 *
 * The Completed and Stock pages ask the same question of the same data and
 * differ only in which side of the balance they keep, so they share this rather
 * than each assembling it.
 */
export type DcRow = {
  id: string;
  dcId: string;
  /** Our challan. */
  dcNumber: string;
  dcDate: string;
  customerName: string;
  /** The customer's own references, which can be several on one challan. */
  customerDcNumbers: string[];
  customerDcDates: string[];
  component: string;
  material: string | null;
  received: number;
  sent: number;
  materialProblem: number;
  rejection: number;
  /** Everything accounted for back to the customer. */
  outward: number;
  /** Received minus outward: still on our floor when positive. */
  pending: number;
};

/** Every item line on file, newest challan first. */
export async function fetchDcRows(): Promise<DcRow[]> {
  const supabase = await createClient();

  const [{ data: dcs }, { data: items }, { data: customers }, { data: picklist }] =
    await Promise.all([
      supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, customer_id, customer_dc_number, customer_dc_date")
        .order("dc_date", { ascending: false }),
      supabase.from("delivery_challan_items").select("*").order("sort_order"),
      supabase.from("customers").select("id, name"),
      supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
    ]);

  const dcById = new Map((dcs ?? []).map((dc) => [dc.id, dc]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  // Names come from the master list wherever the row carries an id, so a
  // rename in Settings shows up here without rewriting a single challan.
  const componentNames = componentNameIndex(picklist ?? []);

  const rows = (items ?? []).flatMap((item) => {
    const dc = dcById.get(item.dc_id);
    if (!dc) return [];
    return [
      {
        id: item.id,
        dcId: dc.id,
        dcNumber: dc.dc_number,
        dcDate: dc.dc_date,
        customerName: customerById.get(dc.customer_id) ?? "-",
        customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
        customerDcDates: (dc.customer_dc_date ?? []).filter(Boolean) as string[],
        component: componentNameOf(item, componentNames),
        material: item.material,
        received: Number(item.received_qty) || 0,
        sent: Number(item.sent_qty) || 0,
        materialProblem: Number(item.material_problem_qty) || 0,
        rejection: Number(item.rejection_qty) || 0,
        outward: outwardTotal(item),
        pending: balanceQty(item),
      },
    ];
  });

  // The item query is ordered within a challan; this orders the challans.
  const dcOrder = new Map((dcs ?? []).map((dc, i) => [dc.id, i]));
  return rows.sort((a, b) => (dcOrder.get(a.dcId) ?? 0) - (dcOrder.get(b.dcId) ?? 0));
}

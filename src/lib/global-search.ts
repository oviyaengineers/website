import { createClient } from "@/lib/supabase/server";
import { balanceQty } from "@/lib/dc-balance";
import { dcLifecycle } from "@/lib/dc-lifecycle";
import { matchesTerm } from "@/lib/dc-search";
import type { ScannedItemSelection } from "@/components/dc-scan-dialog";

/**
 * One search across the whole application.
 *
 * Somebody has a number, a part or a customer in front of them and does not
 * know, or care, which screen it lives on. This looks in all of them and says
 * where each answer came from, so the result is a way in rather than a dead
 * end.
 *
 * Read-only throughout. Nothing here writes.
 */

export type GlobalHitGroup = "component" | "challan" | "scan" | "customer";

export type GlobalHit = {
  key: string;
  group: GlobalHitGroup;
  href: string;
  title: string;
  detail: string;
  /** Where the record sits, shown as a badge. */
  status: string | null;
};

export const GROUP_LABELS: Record<GlobalHitGroup, string> = {
  component: "Components",
  challan: "Delivery challans",
  scan: "Scanned customer DCs",
  customer: "Customers",
};

/** How many of each kind to show, so one kind cannot crowd out the rest. */
const PER_GROUP = 8;

function like(term: string): string {
  return `%${term.replace(/[%_]/g, (ch) => "\\" + ch)}%`;
}

export async function globalSearch(term: string): Promise<GlobalHit[]> {
  const needle = term.trim();
  if (needle.length < 2) return [];

  const supabase = await createClient();
  const pattern = like(needle);

  const [components, customers, challans, scans, items] = await Promise.all([
    supabase
      .from("dc_picklist_items")
      .select("id, name, kind")
      .eq("kind", "component")
      .ilike("name", pattern)
      .limit(PER_GROUP),
    supabase.from("customers").select("id, name").ilike("name", pattern).limit(PER_GROUP),
    supabase
      .from("delivery_challans")
      .select("id, dc_number, dc_date, status, customer_id, customer_dc_number")
      .order("dc_date", { ascending: false })
      .limit(200),
    supabase
      .from("pending_dc_scans")
      .select("id, customer_dc_number, customer_dc_date, items, customer_id")
      .eq("status", "pending")
      .limit(200),
    supabase.from("delivery_challan_items").select("*").limit(2000),
  ]);

  const customerNames = new Map<string, string>();
  const { data: allCustomers } = await supabase.from("customers").select("id, name");
  for (const c of allCustomers ?? []) customerNames.set(c.id, c.name);

  const partsByDc = new Map<string, string[]>();
  const rowsByDc = new Map<string, NonNullable<typeof items.data>>();
  for (const item of items.data ?? []) {
    const words = partsByDc.get(item.dc_id) ?? [];
    words.push(item.component, item.material ?? "");
    partsByDc.set(item.dc_id, words);

    const rows = rowsByDc.get(item.dc_id) ?? [];
    rows.push(item);
    rowsByDc.set(item.dc_id, rows);
  }

  const hits: GlobalHit[] = [];

  for (const component of components.data ?? []) {
    hits.push({
      key: `component-${component.id}`,
      group: "component",
      href: `/dashboard/dc/component/${component.id}`,
      title: component.name,
      detail: "Every challan and scan for this part",
      status: null,
    });
  }

  const challanRows = (challans.data ?? []).filter((dc) =>
    matchesTerm(needle, [
      dc.dc_number,
      customerNames.get(dc.customer_id),
      ...(dc.customer_dc_number ?? []),
      ...(partsByDc.get(dc.id) ?? []),
    ])
  );
  for (const dc of challanRows.slice(0, PER_GROUP)) {
    const rows = rowsByDc.get(dc.id) ?? [];
    const lifecycle = dcLifecycle(dc.status, rows);
    const outstanding = rows.reduce((total, row) => total + balanceQty(row), 0);
    hits.push({
      key: `challan-${dc.id}`,
      group: "challan",
      href: `/dashboard/dc/${dc.id}`,
      title: dc.dc_number,
      detail: [customerNames.get(dc.customer_id), (dc.customer_dc_number ?? []).join(", ")]
        .filter(Boolean)
        .join(" · "),
      status:
        lifecycle === "completed"
          ? "Completed"
          : `${lifecycle === "draft" ? "Draft" : "Active"} · ${outstanding} pending`,
    });
  }

  const scanRows = (scans.data ?? []).filter((scan) => {
    const lines = (Array.isArray(scan.items) ? scan.items : []) as ScannedItemSelection[];
    return matchesTerm(needle, [
      scan.customer_dc_number,
      customerNames.get(scan.customer_id ?? ""),
      ...lines.flatMap((line) => [line.component, line.material]),
    ]);
  });
  for (const scan of scanRows.slice(0, PER_GROUP)) {
    hits.push({
      key: `scan-${scan.id}`,
      group: "scan",
      href: `/dashboard/dc/scanned/${scan.id}`,
      title: scan.customer_dc_number || "Scanned customer DC",
      detail: customerNames.get(scan.customer_id ?? "") ?? "Waiting to be entered",
      status: "Pending scan",
    });
  }

  for (const customer of customers.data ?? []) {
    hits.push({
      key: `customer-${customer.id}`,
      group: "customer",
      href: `/dashboard/customers`,
      title: customer.name,
      detail: "Customer record",
      status: null,
    });
  }

  return hits;
}

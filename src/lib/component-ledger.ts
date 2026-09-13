import { createClient } from "@/lib/supabase/server";
import { challanSettledIn, figuresFor, indexChain, type LineFigures } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { dcLifecycle, type DcLifecycle } from "@/lib/dc-lifecycle";
import type { ScannedItemSelection } from "@/components/dc-scan-dialog";

/**
 * Everything that has happened to one component, wherever it currently sits.
 *
 * A part's history is spread across three places: customer DCs scanned but
 * not yet entered, challans still owing work, and challans fully reconciled.
 * Asking "how many of this casting are on the floor" means asking all three,
 * so they are gathered here rather than on each screen separately.
 *
 * Rows are matched on the component id where one exists, falling back to the
 * name. The id is what keeps a renamed part's history together and stops one
 * casting's quantities appearing under another.
 */

export type LedgerStatus = DcLifecycle | "pending-scan";

export type LedgerRow = {
  key: string;
  /** Where this line lives, which decides what it links to. */
  source: "scan" | "challan";
  href: string;
  date: string | null;
  customerName: string;
  customerDcNumber: string;
  customerDcDate: string | null;
  ourDcNumber: string | null;
  material: string | null;
  received: number;
  /** For an original line, its own despatch plus every confirmed follow-up. */
  sent: number;
  /** This row's own sent quantity, shown when the chain figure differs from it. */
  ownSent: number;
  materialProblem: number;
  rejection: number;
  /**
   * Received less everything accounted back, counting confirmed despatches
   * on later challans. Null where the line has no balance of its own: a scan
   * not yet entered, or a line that continues an earlier challan.
   */
  balance: number | null;
  /** Quantity on draft follow-ups against this line, not yet counted. */
  onDraft: number;
  status: LedgerStatus;
};

export type ComponentLedger = {
  id: string;
  name: string;
  rows: LedgerRow[];
  summary: {
    received: number;
    sent: number;
    materialProblem: number;
    rejection: number;
    /** On our floor: what challans still owe. Scans are not counted here. */
    balance: number;
    /** Received on customer DCs scanned but not yet entered. */
    awaitingEntry: number;
    pendingScans: number;
    activeChallans: number;
    completedChallans: number;
  };
};

export const LEDGER_STATUS_LABELS: Record<LedgerStatus, string> = {
  "pending-scan": "Pending scan",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

/** Every component on the master list, for the picker. */
export async function listComponents(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("kind", "component")
    .order("name");
  return data ?? [];
}

export async function fetchComponentLedger(componentId: string): Promise<ComponentLedger | null> {
  const supabase = await createClient();

  const { data: component } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("id", componentId)
    .eq("kind", "component")
    .maybeSingle();
  if (!component) return null;

  // Matched by id first, by name second. The name clause catches rows written
  // before the component id existed, and rows whose part has since been
  // removed from the master list.
  const quoted = `"${component.name.replace(/"/g, '\\"')}"`;
  const [{ data: items }, { data: scans }] = await Promise.all([
    supabase
      .from("delivery_challan_items")
      .select("*")
      .or(`component_id.eq.${component.id},component.eq.${quoted}`),
    supabase
      .from("pending_dc_scans")
      .select("id, customer_id, customer_dc_number, customer_dc_date, items, created_at")
      .eq("status", "pending")
      // Stringified on purpose: given an array, supabase-js emits Postgres
      // array syntax, which a jsonb column rejects silently by matching
      // nothing. The pending scans then vanished from the ledger.
      .contains("items", JSON.stringify([{ component: component.name }])),
  ]);

  const dcIds = [...new Set((items ?? []).map((item) => item.dc_id))];
  const [{ data: challans }, { data: customers }] = await Promise.all([
    dcIds.length > 0
      ? supabase.from("delivery_challans").select("*").in("id", dcIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("customers").select("id, name"),
  ]);

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const challanById = new Map((challans ?? []).map((dc) => [dc.id, dc]));

  // The lifecycle of a challan depends on all of its rows, not just this
  // part's, so every row of each challan involved has to be weighed.
  const siblings =
    dcIds.length > 0
      ? ((await supabase.from("delivery_challan_items").select("*").in("dc_id", dcIds)).data ?? [])
      : [];
  const rowsByDc = new Map<string, typeof siblings>();
  for (const row of siblings) {
    const list = rowsByDc.get(row.dc_id);
    if (list) list.push(row);
    else rowsByDc.set(row.dc_id, [row]);
  }

  // Balance is a property of a chain, so it is read from every line on file,
  // marked draft or not, through the calculation every screen shares. The
  // despatch that settles this component may sit on a challan that holds
  // nothing else of it, and a draft follow-up must not settle it at all.
  const chain = indexChain(await fetchChainRows(supabase));
  const originals: LineFigures[] = [];

  const rows: LedgerRow[] = [];

  for (const item of items ?? []) {
    const dc = challanById.get(item.dc_id);
    if (!dc) continue;
    const line = figuresFor(item, chain);
    if (!line.continues) originals.push(line);
    const challanRows = rowsByDc.get(dc.id) ?? [];
    rows.push({
      key: `item-${item.id}`,
      source: "challan",
      href: `/dashboard/dc/${dc.id}`,
      date: dc.dc_date,
      customerName: nameById.get(dc.customer_id) ?? "-",
      customerDcNumber: (dc.customer_dc_number ?? []).filter(Boolean).join(", ") || "-",
      customerDcDate: (dc.customer_dc_date ?? []).filter(Boolean)[0] ?? null,
      ourDcNumber: dc.dc_number,
      material: item.material,
      // An original row carries its confirmed follow-ups, as on every other
      // screen, so the row adds up to its balance. A follow-up row shows its
      // own despatch and has no balance of its own.
      received: line.received,
      sent: line.sent,
      ownSent: line.ownSent,
      materialProblem: line.materialProblem,
      rejection: line.rejection,
      balance: line.balance,
      onDraft: line.onDraft,
      status: dcLifecycle(dc.status, challanRows, challanSettledIn(challanRows, chain)),
    });
  }

  for (const scan of scans ?? []) {
    const lines = (Array.isArray(scan.items) ? scan.items : []) as ScannedItemSelection[];
    for (const [index, line] of lines.entries()) {
      if (line.component !== component.name) continue;
      rows.push({
        key: `scan-${scan.id}-${index}`,
        source: "scan",
        href: `/dashboard/dc/scanned/${scan.id}`,
        date: scan.customer_dc_date ?? scan.created_at,
        customerName: nameById.get(scan.customer_id ?? "") ?? "-",
        customerDcNumber: scan.customer_dc_number || "-",
        customerDcDate: scan.customer_dc_date,
        // No challan of ours exists yet, which is the point of this row.
        ourDcNumber: null,
        material: line.material ?? null,
        received: Number(line.received_qty) || 0,
        sent: 0,
        ownSent: 0,
        materialProblem: 0,
        rejection: 0,
        balance: null,
        onDraft: 0,
        status: "pending-scan",
      });
    }
  }

  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const total = (pick: (line: LineFigures) => number) =>
    originals.reduce((sum, line) => sum + pick(line), 0);

  return {
    id: component.id,
    name: component.name,
    rows,
    // Totals from the original lines alone, each carrying its confirmed
    // follow-ups, so received less outward always equals the balance and no
    // despatch is counted on both its own row and the line it completes.
    summary: {
      received: total((line) => line.received),
      sent: total((line) => line.sent),
      materialProblem: total((line) => line.materialProblem),
      rejection: total((line) => line.rejection),
      balance: total((line) => line.balance ?? 0),
      awaitingEntry: rows
        .filter((row) => row.source === "scan")
        .reduce((sum, row) => sum + row.received, 0),
      pendingScans: rows.filter((row) => row.status === "pending-scan").length,
      activeChallans: new Set(
        rows.filter((row) => row.status === "active").map((row) => row.ourDcNumber)
      ).size,
      completedChallans: new Set(
        rows.filter((row) => row.status === "completed").map((row) => row.ourDcNumber)
      ).size,
    },
  };
}

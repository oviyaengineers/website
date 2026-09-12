import { balanceQty } from "@/lib/dc-balance";
import { fetchDcSummaries, type DcListFilters, type DcSummary } from "@/lib/dc-list";
import type { DeliveryChallanItemRow } from "@/types/database";

/**
 * Delivery challans we have actually issued to the customer.
 *
 * "Dispatched" is not a new status and not a new table. A challan is
 * dispatched once it has been confirmed: that is the moment it leaves draft,
 * gets handed over, and becomes something the customer is holding. Drafts are
 * not dispatched, and a scanned customer DC is not ours at all, so neither
 * appears here.
 *
 * Whether a dispatched challan is still pending or finished is read from its
 * quantities every time, never stored. The same master record moves between
 * the two tabs on its own as the sent quantity is filled in.
 */

export type DispatchedTab = "pending" | "completed";

/** One item line, carrying the challan it belongs to. */
export type DispatchedLine = {
  key: string;
  dcId: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumber: string;
  customerDcDate: string | null;
  component: string;
  material: string | null;
  received: number;
  sent: number;
  materialProblem: number;
  rejection: number;
  /** This line's own balance, which is what the shop floor reconciles. */
  balance: number;
};

export type DispatchedDc = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  customerDcDates: (string | null)[];
  /** The whole challan's outstanding quantity, which decides its tab. */
  balance: number;
  received: number;
  sent: number;
  materialProblem: number;
  rejection: number;
  lines: DispatchedLine[];
};

function lineFrom(dc: DcSummary, item: DeliveryChallanItemRow): DispatchedLine {
  return {
    key: item.id,
    dcId: dc.id,
    dcNumber: dc.dcNumber,
    dcDate: dc.dcDate,
    customerName: dc.customerName,
    customerDcNumber: dc.customerDcNumbers.join(", ") || "-",
    customerDcDate: dc.customerDcDates.filter(Boolean)[0] ?? null,
    component: item.component,
    material: item.material,
    received: Number(item.received_qty) || 0,
    sent: Number(item.sent_qty) || 0,
    materialProblem: Number(item.material_problem_qty) || 0,
    rejection: Number(item.rejection_qty) || 0,
    balance: balanceQty(item),
  };
}

/**
 * Dispatched challans matching the filters, split by whether anything is
 * still outstanding.
 *
 * Both tabs come from one query of the same master records, so a challan can
 * never appear in both, nor be missing from both.
 */
export async function fetchDispatched(
  filters: DcListFilters & { customer?: string }
): Promise<{ pending: DispatchedDc[]; completed: DispatchedDc[] }> {
  // status is the tab here, not a filter on the query, so it is not passed on.
  const summaries = await fetchDcSummaries({
    q: filters.q,
    from: filters.from,
    to: filters.to,
    component: filters.component,
  });

  const dispatched = summaries
    // A draft has not been issued to anybody yet.
    .filter((dc) => dc.lifecycle !== "draft")
    .filter((dc) => !filters.customer || dc.customerName === filters.customer)
    .map((dc) => ({
      id: dc.id,
      dcNumber: dc.dcNumber,
      dcDate: dc.dcDate,
      customerName: dc.customerName,
      customerDcNumbers: dc.customerDcNumbers,
      customerDcDates: dc.customerDcDates,
      balance: dc.balance,
      received: dc.received,
      sent: dc.sent,
      materialProblem: dc.materialProblem,
      rejection: dc.rejection,
      lines: dc.items.map((item) => lineFrom(dc, item)),
    }));

  return {
    pending: dispatched.filter((dc) => dc.balance > 0),
    completed: dispatched.filter((dc) => dc.balance <= 0),
  };
}

/** Column totals for whichever tab is showing. */
export function totalDispatched(rows: DispatchedDc[]) {
  return {
    received: rows.reduce((total, dc) => total + dc.received, 0),
    sent: rows.reduce((total, dc) => total + dc.sent, 0),
    materialProblem: rows.reduce((total, dc) => total + dc.materialProblem, 0),
    rejection: rows.reduce((total, dc) => total + dc.rejection, 0),
    balance: rows.reduce((total, dc) => total + dc.balance, 0),
  };
}

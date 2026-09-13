import type { LineFigures } from "@/lib/dc-chain";
import {
  fetchDcSummaries,
  type DcListFilters,
  type DcSummary,
  type ReconciledTotals,
} from "@/lib/dc-list";
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
 * quantities every time, never stored, through the same chain calculation as
 * every other screen. The same master record moves between the two tabs on its
 * own as despatches are confirmed.
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
  /** For an original line, its own despatch plus every confirmed follow-up. */
  sent: number;
  materialProblem: number;
  rejection: number;
  /** Received less counted outward. Null on a follow-up line, which owes nothing itself. */
  balance: number | null;
  /** Outward sitting on draft follow-ups: booked, not yet counted. */
  onDraft: number;
  /** What a new follow-up may carry. */
  bookable: number;
  /** This row's own sent quantity, shown when the chain figure differs from it. */
  ownSent: number;
  /** True where the line despatches against a lot received on an earlier challan. */
  continues: boolean;
  /** On a follow-up line: pending on the original without this challan. */
  pending: number | null;
  /** On a follow-up line: what the original owes once this challan counts. */
  after: number | null;
  /** On a follow-up line: the original's challan number. */
  rootDcNumber: string | null;
};

export type DispatchedDc = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerName: string;
  customerDcNumbers: string[];
  customerDcDates: (string | null)[];
  /** True once every component stands at exactly zero, which decides its tab. */
  settled: boolean;
  /** This challan's share of the column totals, counted once. */
  reconciled: ReconciledTotals;
  lines: DispatchedLine[];
};

function lineFrom(dc: DcSummary, item: DeliveryChallanItemRow, line: LineFigures): DispatchedLine {
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
    received: line.received,
    sent: line.sent,
    materialProblem: line.materialProblem,
    rejection: line.rejection,
    balance: line.balance,
    onDraft: line.onDraft,
    bookable: line.bookable,
    ownSent: line.ownSent,
    continues: line.continues,
    pending: line.pending,
    after: line.after,
    rootDcNumber: line.rootDcNumber,
  };
}

/**
 * Dispatched challans matching the filters, split by whether anything is
 * still outstanding.
 *
 * Both tabs come from one query of the same master records, so a challan can
 * never appear in both, nor be missing from both. Completed means every
 * component at exactly zero. A line still owing, or one with more out than
 * in, keeps the challan in Pending where it will be seen.
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

  const dispatched: DispatchedDc[] = summaries
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
      settled: dc.settled,
      reconciled: dc.reconciled,
      lines: dc.items.map((item, index) => lineFrom(dc, item, dc.lines[index])),
    }));

  return {
    pending: dispatched.filter((dc) => !dc.settled),
    completed: dispatched.filter((dc) => dc.settled),
  };
}

/** Column totals for whichever tab is showing, each despatch counted once. */
export function totalDispatched(rows: DispatchedDc[]): ReconciledTotals {
  return {
    received: rows.reduce((total, dc) => total + dc.reconciled.received, 0),
    sent: rows.reduce((total, dc) => total + dc.reconciled.sent, 0),
    materialProblem: rows.reduce((total, dc) => total + dc.reconciled.materialProblem, 0),
    rejection: rows.reduce((total, dc) => total + dc.reconciled.rejection, 0),
    balance: rows.reduce((total, dc) => total + dc.reconciled.balance, 0),
  };
}

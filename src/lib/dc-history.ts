import { figuresFor, indexChain, type ChainIndex } from "@/lib/dc-chain";
import type { ChainRow } from "@/lib/dc-chain-data";
import { matchesTerm } from "@/lib/dc-search";
import { foldOcrConfusables } from "@/lib/ocr/parse-inward-dc";

/**
 * One dated history of every DC record: the customer DCs scanned and still
 * waiting, and our own challans once they have been issued.
 *
 * A read-only report over the master records. Nothing here is stored, and
 * nothing is copied: each row is a line of an existing challan or of an
 * existing scan, figured through the same chain calculation as every other
 * screen, so a balance here can never disagree with the Dispatched page.
 *
 * Which date a record is filed under:
 *   - our delivery challan: its DC date (`delivery_challans.dc_date`);
 *   - a scanned customer DC: the date printed on the customer's DC
 *     (`pending_dc_scans.customer_dc_date`), falling back to the day it was
 *     scanned (`created_at`, India time) only when no date was read.
 */

export type HistoryKind = "scanned" | "dispatched-pending" | "completed";

export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = {
  scanned: "Scanned - Pending",
  "dispatched-pending": "Dispatched - Pending",
  completed: "Completed",
};

export type HistoryDateSource = "dc-date" | "customer-dc-date" | "scanned-at";

export const HISTORY_DATE_SOURCE_LABELS: Record<HistoryDateSource, string> = {
  "dc-date": "our DC date",
  "customer-dc-date": "customer DC date",
  "scanned-at": "scanned on (no DC date read)",
};

export type HistoryRecord = {
  /** Unique per row: the item line's id, or the scan's id and item position. */
  key: string;
  kind: HistoryKind;
  /** The business date, yyyy-mm-dd. */
  date: string;
  dateSource: HistoryDateSource;
  /** Our challan number, or null on a scan, which has none yet. */
  dcNumber: string | null;
  customerDcNumbers: string[];
  customerName: string;
  component: string | null;
  material: string | null;
  /** What came in on this line. Null on a follow-up, which received nothing. */
  received: number | null;
  /** On a follow-up: what was pending on the original before this despatch. */
  pending: number | null;
  /** This record's own despatch, so a despatch is only ever counted on one row. */
  sent: number;
  materialProblem: number;
  rejection: number;
  /** Sent on this line's confirmed follow-ups, which appear as rows of their own. */
  sentOnFollowUps: number;
  /**
   * Original line: what is still on our floor. Follow-up: what is left on the
   * original. Scan: everything received, as nothing has gone back yet.
   */
  balance: number | null;
  /** The original challan a follow-up despatches against. */
  followUpOf: { dcId: string | null; dcNumber: string | null } | null;
  /** Opens the exact record this row came from. */
  href: string;
  /** The line whose balance this row reports, so a total counts each once. */
  balanceLineId: string | null;
  /** Secondary ordering within a day: when the record was made, then its number. */
  createdAt: string;
  sortNumber: string;
  lineOrder: number;
};

export type HistoryFilters = {
  from?: string;
  to?: string;
  q?: string;
  component?: string;
  customer?: string;
};

export type HistorySummary = {
  totalRecords: number;
  scannedPending: number;
  dispatchedPending: number;
  completed: number;
  received: number;
  sent: number;
  materialProblem: number;
  rejection: number;
  balance: number;
};

export type HistoryChallan = {
  id: string;
  dc_number: string;
  dc_date: string;
  customer_id: string;
  customer_dc_number: string[] | null;
  status: string;
  created_at: string;
};

export type HistoryScan = {
  id: string;
  customer_id: string | null;
  customer_dc_number: string | null;
  customer_dc_date: string | null;
  items: unknown;
  status: string;
  created_at: string;
};

export type HistorySource = {
  challans: HistoryChallan[];
  /** Every challan line on file, with its draft mark: balance crosses challans. */
  chainRows: ChainRow[];
  scans: HistoryScan[];
  customers: { id: string; name: string }[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A yyyy-mm-dd from a URL, or undefined when it is missing or malformed. */
export function isoDateOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!ISO_DATE.test(trimmed)) return undefined;
  return Number.isNaN(new Date(`${trimmed}T00:00:00Z`).getTime()) ? undefined : trimmed;
}

/** Filters as they arrive in the URL, blanks and bad dates dropped. */
export function parseHistoryFilters(params: Record<string, string | undefined>): HistoryFilters {
  const text = (value: string | undefined) => value?.trim() || undefined;
  return {
    from: isoDateOrUndefined(params.from),
    to: isoDateOrUndefined(params.to),
    q: text(params.q),
    component: text(params.component),
    customer: text(params.customer),
  };
}

/** The calendar day in India for a timestamp. The business runs on that clock. */
function indiaDay(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp.slice(0, 10);
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type ScanItem = { component?: unknown; material?: unknown; received_qty?: unknown };

function recordsFromScans(scans: HistoryScan[], nameById: Map<string, string>): HistoryRecord[] {
  // Only scans still waiting. Once our challan is raised from one, the work is
  // that challan's row; a discarded scan is not work at all.
  return scans
    .filter((scan) => scan.status === "pending")
    .flatMap((scan) => {
      const printed = scan.customer_dc_date?.slice(0, 10);
      const hasDate = Boolean(printed && isoDateOrUndefined(printed));
      const date = hasDate ? (printed as string) : indiaDay(scan.created_at);
      const items = (Array.isArray(scan.items) ? scan.items : []) as ScanItem[];
      // A scan with no parts read is still a customer DC that came in, so it
      // keeps a row rather than vanishing from the history.
      const lines: (ScanItem | null)[] = items.length > 0 ? items : [null];

      return lines.map((item, index): HistoryRecord => {
        const received = item ? num(item.received_qty) : 0;
        return {
          key: `scan:${scan.id}:${index}`,
          kind: "scanned",
          date,
          dateSource: hasDate ? "customer-dc-date" : "scanned-at",
          dcNumber: null,
          customerDcNumbers: scan.customer_dc_number ? [scan.customer_dc_number] : [],
          customerName: (scan.customer_id && nameById.get(scan.customer_id)) || "-",
          component: item && typeof item.component === "string" ? item.component : null,
          material: item && typeof item.material === "string" ? item.material : null,
          received,
          pending: null,
          sent: 0,
          materialProblem: 0,
          rejection: 0,
          sentOnFollowUps: 0,
          balance: received,
          followUpOf: null,
          href: `/dashboard/dc/scanned/${scan.id}`,
          balanceLineId: null,
          createdAt: scan.created_at,
          sortNumber: scan.customer_dc_number ?? "",
          lineOrder: index,
        };
      });
    });
}

function recordsFromChallans(
  challans: HistoryChallan[],
  chainRows: ChainRow[],
  chain: ChainIndex,
  nameById: Map<string, string>
): HistoryRecord[] {
  const linesByDc = new Map<string, ChainRow[]>();
  for (const row of chainRows) {
    const list = linesByDc.get(row.dc_id);
    if (list) list.push(row);
    else linesByDc.set(row.dc_id, [row]);
  }

  return (
    challans
      // A draft has not been issued to anybody, so it is not yet history.
      .filter((dc) => dc.status !== "draft")
      .flatMap((dc) =>
        [...(linesByDc.get(dc.id) ?? [])]
          .sort((a, b) => num(a.sort_order) - num(b.sort_order))
          .map((item, index): HistoryRecord => {
            const figures = figuresFor(item, chain);
            const own = {
              sent: num(item.sent_qty),
              materialProblem: num(item.material_problem_qty),
              rejection: num(item.rejection_qty),
            };
            // Judged per component, at exactly zero: an original by its own
            // balance, a follow-up by what is left on the original it served.
            const owed = figures.continues ? figures.after : figures.balance;
            const rootId = chain.rootOf.get(item.id) ?? item.id;

            return {
              key: item.id,
              kind: owed === 0 ? "completed" : "dispatched-pending",
              date: dc.dc_date.slice(0, 10),
              dateSource: "dc-date",
              dcNumber: dc.dc_number,
              customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
              customerName: nameById.get(dc.customer_id) ?? "-",
              component: item.component,
              material: item.material,
              received: figures.continues ? null : figures.received,
              pending: figures.pending,
              ...own,
              sentOnFollowUps: figures.continues ? 0 : figures.sent - figures.ownSent,
              balance: owed,
              followUpOf: figures.continues
                ? { dcId: figures.rootDcId, dcNumber: figures.rootDcNumber }
                : null,
              href: `/dashboard/dc/${dc.id}`,
              balanceLineId: figures.continues && owed === null ? null : rootId,
              createdAt: dc.created_at,
              sortNumber: dc.dc_number,
              lineOrder: index,
            };
          })
      )
  );
}

/** Date ascending; then when it was made, its number, and its line order. */
export function compareHistory(a: HistoryRecord, b: HistoryRecord): number {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.sortNumber.localeCompare(b.sortNumber, undefined, { numeric: true }) ||
    a.lineOrder - b.lineOrder
  );
}

function matchesFilters(record: HistoryRecord, filters: HistoryFilters): boolean {
  // Inclusive at both ends. Dates are compared as yyyy-mm-dd text, which
  // orders exactly as the calendar does and carries no time of day to slip.
  if (filters.from && record.date < filters.from) return false;
  if (filters.to && record.date > filters.to) return false;

  if (filters.customer && record.customerName !== filters.customer) return false;

  // Compared the way the component list itself is: case, OCR slips and a
  // drawing revision do not make a different part.
  if (filters.component) {
    if (!record.component) return false;
    if (foldOcrConfusables(record.component) !== foldOcrConfusables(filters.component)) {
      return false;
    }
  }

  if (filters.q) {
    return matchesTerm(filters.q, [
      record.dcNumber,
      ...record.customerDcNumbers,
      record.customerName,
      record.component,
      record.material,
      // Searching an original's number reaches the follow-ups made against it.
      record.followUpOf?.dcNumber,
    ]);
  }
  return true;
}

/**
 * Totals for the rows on screen, each quantity counted once.
 *
 * Sent, material problem and rejection are each row's own figures, so a
 * despatch is counted on the challan that made it and nowhere else. Balance is
 * taken once per original line however many of its follow-ups are listed, and
 * a scan adds what it received, since nothing has gone back against it yet.
 */
export function summariseHistory(records: HistoryRecord[], chain?: ChainIndex): HistorySummary {
  const balanceByLine = new Map<string, number>();
  let scanBalance = 0;
  for (const record of records) {
    if (record.kind === "scanned") {
      scanBalance += record.balance ?? 0;
    } else if (record.balanceLineId && !balanceByLine.has(record.balanceLineId)) {
      balanceByLine.set(
        record.balanceLineId,
        chain?.remaining.get(record.balanceLineId) ?? record.balance ?? 0
      );
    }
  }

  const sum = (pick: (record: HistoryRecord) => number) =>
    records.reduce((total, record) => total + pick(record), 0);

  return {
    totalRecords: records.length,
    scannedPending: records.filter((r) => r.kind === "scanned").length,
    dispatchedPending: records.filter((r) => r.kind === "dispatched-pending").length,
    completed: records.filter((r) => r.kind === "completed").length,
    received: sum((r) => r.received ?? 0),
    sent: sum((r) => r.sent),
    materialProblem: sum((r) => r.materialProblem),
    rejection: sum((r) => r.rejection),
    balance: scanBalance + [...balanceByLine.values()].reduce((a, b) => a + b, 0),
  };
}

export type HistoryResult = {
  records: HistoryRecord[];
  summary: HistorySummary;
  /** Set when the filters cannot describe any range, such as From after To. */
  error: string | null;
};

/** The filtered, ordered history. Pure: it reads what it is given and nothing else. */
export function buildHistory(source: HistorySource, filters: HistoryFilters): HistoryResult {
  const chain = indexChain(source.chainRows);

  if (filters.from && filters.to && filters.from > filters.to) {
    return {
      records: [],
      summary: summariseHistory([], chain),
      error: "The From date is after the To date.",
    };
  }

  const nameById = new Map(source.customers.map((c) => [c.id, c.name]));
  const records = [
    ...recordsFromScans(source.scans, nameById),
    ...recordsFromChallans(source.challans, source.chainRows, chain, nameById),
  ]
    .filter((record) => matchesFilters(record, filters))
    .sort(compareHistory);

  return { records, summary: summariseHistory(records, chain), error: null };
}

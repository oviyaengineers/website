import { outwardTotal, type DcQuantities } from "@/lib/dc-balance";

/**
 * Balance across a chain of challans.
 *
 * One lot can be returned over several despatches, each its own challan with
 * its own number. The pieces were received once, on the original line, so a
 * continuation line carries received_qty = 0 and only records what went out.
 * Its outward quantities belong to the original line's balance.
 *
 * That makes balance a property of a chain rather than of a row:
 *
 *   remaining = received − outward(original) − outward(confirmed continuations)
 *
 * where outward is sent + material problem + rejection.
 *
 * A continuation on a challan still in draft does not count. Nothing on it has
 * left the building, so letting it close the original would show work as
 * finished that has not been despatched. It is reported alongside instead, as
 * quantity already booked, so a second follow-up cannot claim the same pieces.
 *
 * A continuation line has no balance of its own. Reading one as if it did
 * would show it as over-delivered, and would subtract the same pieces twice
 * from stock.
 *
 * Every screen reads balance through this module. A page that works it out
 * for itself is how two pages come to disagree about the same line.
 */

/** Outward movement kept in its three columns rather than summed. */
export type OutwardParts = {
  sent: number;
  materialProblem: number;
  rejection: number;
};

export type ChainItem = DcQuantities & {
  id: string;
  parent_item_id?: string | null;
  /** The challan the line is on, so a challan being edited can leave out its own drafts. */
  dc_id?: string;
  /** True when the line sits on a challan still in draft. */
  draft?: boolean;
};

/** A line that starts a piece of work: pieces came in against it. */
export function isOriginalLine(item: { parent_item_id?: string | null }): boolean {
  return !item.parent_item_id;
}

/** A line that records a later despatch against an earlier lot. */
export function isContinuationLine(item: { parent_item_id?: string | null }): boolean {
  return Boolean(item.parent_item_id);
}

/**
 * Whether a line's outward movement is subtracted from its lot.
 *
 * An original line always carries its own figures. A follow-up counts only
 * once its challan is confirmed.
 */
export function countsTowardBalance(item: ChainItem): boolean {
  return isOriginalLine(item) || !item.draft;
}

/** Each line paired with the id of the original it ultimately belongs to. */
function* eachWithRoot(items: ChainItem[]): Generator<[string, ChainItem]> {
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    let root = item;
    const seen = new Set<string>([item.id]);
    while (root.parent_item_id) {
      const parent = byId.get(root.parent_item_id);
      // The parent may be outside the set handed in, or the links may loop.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      root = parent;
    }
    yield [root.id, item];
  }
}

/**
 * The original line a follow-up ultimately belongs to.
 *
 * Walks the parent links the same way the balance does, so a follow-up of a
 * follow-up lands on the line that received the lot. An original line is its
 * own root. Undefined when the line is not in the set handed in.
 */
export function rootLineOf<T extends ChainItem>(itemId: string, items: T[]): T | undefined {
  const byId = new Map(items.map((item) => [item.id, item]));
  let root = byId.get(itemId);
  if (!root) return undefined;
  const seen = new Set<string>([root.id]);
  while (root.parent_item_id) {
    const parent: T | undefined = byId.get(root.parent_item_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }
  return root;
}

function ownParts(item: ChainItem): OutwardParts {
  return {
    sent: Number(item.sent_qty) || 0,
    materialProblem: Number(item.material_problem_qty) || 0,
    rejection: Number(item.rejection_qty) || 0,
  };
}

/**
 * Counted outward totals gathered onto the line each ultimately belongs to.
 *
 * Walks the parent links so a continuation of a continuation still lands on
 * the original, and stops if the data ever contains a cycle rather than
 * looping forever.
 */
export function outwardByOriginal(items: ChainItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [id, item] of eachWithRoot(items)) {
    if (!countsTowardBalance(item)) continue;
    totals.set(id, (totals.get(id) ?? 0) + outwardTotal(item));
  }
  return totals;
}

/**
 * The same gathering, kept split into the three outward columns.
 *
 * Screens show sent, material problem and rejection separately, and each has
 * to carry the whole chain or the figures stop adding up to what was received.
 */
export function outwardPartsByOriginal(items: ChainItem[]): Map<string, OutwardParts> {
  const totals = new Map<string, OutwardParts>();

  for (const [id, item] of eachWithRoot(items)) {
    if (!countsTowardBalance(item)) continue;
    const part = totals.get(id) ?? { sent: 0, materialProblem: 0, rejection: 0 };
    const own = ownParts(item);
    part.sent += own.sent;
    part.materialProblem += own.materialProblem;
    part.rejection += own.rejection;
    totals.set(id, part);
  }

  return totals;
}

/**
 * Outward quantity sitting on draft follow-ups, gathered onto each original.
 *
 * Not subtracted from the balance, but already promised: a new follow-up has
 * to leave room for it.
 *
 * `excludeDcId` leaves out one challan's own lines, for when that challan is
 * the draft being edited and its old figures are about to be replaced.
 */
export function draftOutwardByOriginal(
  items: ChainItem[],
  excludeDcId?: string | null
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [id, item] of eachWithRoot(items)) {
    if (countsTowardBalance(item)) continue;
    if (excludeDcId && item.dc_id === excludeDcId) continue;
    totals.set(id, (totals.get(id) ?? 0) + outwardTotal(item));
  }
  return totals;
}

/**
 * What an original line still owes, counting every confirmed despatch.
 *
 * `items` must include the continuations, or the answer is the row's own
 * balance and the later despatches are invisible.
 */
export function remainingOnLine(originalId: string, items: ChainItem[]): number {
  const original = items.find((item) => item.id === originalId);
  if (!original) return 0;
  const outward = outwardByOriginal(items).get(originalId) ?? 0;
  return (Number(original.received_qty) || 0) - outward;
}

/** Every original line with what it still owes, confirmed continuations folded in. */
export function remainingByLine(items: ChainItem[]): Map<string, number> {
  const outward = outwardByOriginal(items);
  const remaining = new Map<string, number>();
  for (const item of items) {
    if (!isOriginalLine(item)) continue;
    remaining.set(item.id, (Number(item.received_qty) || 0) - (outward.get(item.id) ?? 0));
  }
  return remaining;
}

/**
 * How much a new follow-up against a line may carry.
 *
 * The balance less what drafts have already booked, so two drafts cannot
 * between them promise more pieces than are left.
 */
export function bookableOnLine(
  originalId: string,
  items: ChainItem[],
  excludeDcId?: string | null
): number {
  const booked = draftOutwardByOriginal(items, excludeDcId).get(originalId) ?? 0;
  return remainingOnLine(originalId, items) - booked;
}

/** Everything a screen needs about lines, worked out once for all of them. */
export type ChainIndex = {
  parts: Map<string, OutwardParts>;
  remaining: Map<string, number>;
  onDraft: Map<string, number>;
};

/** Build the maps once, so a list of many challans does not rescan every line per row. */
export function indexChain(items: ChainItem[]): ChainIndex {
  return {
    parts: outwardPartsByOriginal(items),
    remaining: remainingByLine(items),
    onDraft: draftOutwardByOriginal(items),
  };
}

/** One line's figures as every screen shows them. */
export type LineFigures = {
  id: string;
  /** True for a follow-up line, which has no balance of its own. */
  continues: boolean;
  received: number;
  /** For an original line, the whole confirmed chain; for a follow-up, its own row. */
  sent: number;
  materialProblem: number;
  rejection: number;
  total: number;
  /** Received less counted outward. Null on a follow-up line. */
  balance: number | null;
  /** Outward on draft follow-ups, not yet counted. Always 0 on a follow-up line. */
  onDraft: number;
  /** What a new follow-up may carry: balance less drafts. 0 on a follow-up line. */
  bookable: number;
  /** This row's own sent quantity, to show when the chain figure differs from it. */
  ownSent: number;
};

export function figuresFor(item: ChainItem, index: ChainIndex): LineFigures {
  const own = ownParts(item);

  if (isContinuationLine(item)) {
    return {
      id: item.id,
      continues: true,
      received: 0,
      ...own,
      total: own.sent + own.materialProblem + own.rejection,
      balance: null,
      onDraft: 0,
      bookable: 0,
      ownSent: own.sent,
    };
  }

  const chain = index.parts.get(item.id) ?? own;
  const received = Number(item.received_qty) || 0;
  const balance =
    index.remaining.get(item.id) ?? received - chain.sent - chain.materialProblem - chain.rejection;
  const onDraft = index.onDraft.get(item.id) ?? 0;

  return {
    id: item.id,
    continues: false,
    received,
    ...chain,
    total: chain.sent + chain.materialProblem + chain.rejection,
    balance,
    onDraft,
    bookable: balance - onDraft,
    ownSent: own.sent,
  };
}

/**
 * A challan's outstanding quantity.
 *
 * Only its own original lines count. A challan made purely of continuations
 * owes nothing itself: it is a despatch document, and what it despatched is
 * already subtracted from the challan that received the lot.
 */
export function outstandingForChallan(challanItems: ChainItem[], allItems: ChainItem[]): number {
  return outstandingIn(challanItems, indexChain(allItems));
}

export function outstandingIn(challanItems: ChainItem[], index: ChainIndex): number {
  return challanItems
    .filter(isOriginalLine)
    .reduce((total, item) => total + (index.remaining.get(item.id) ?? 0), 0);
}

/**
 * Whether every component on a challan has reached exactly zero.
 *
 * Judged line by line, never on the sum: one component 20 short and another
 * 20 over add up to zero, and that challan is anything but finished. Nor is a
 * negative balance finished; it is a keying error to be put right.
 */
export function challanSettled(challanItems: ChainItem[], allItems: ChainItem[]): boolean {
  return challanSettledIn(challanItems, indexChain(allItems));
}

export function challanSettledIn(challanItems: ChainItem[], index: ChainIndex): boolean {
  return challanItems
    .filter(isOriginalLine)
    .every((item) => (index.remaining.get(item.id) ?? 0) === 0);
}

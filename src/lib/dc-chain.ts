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
 *   remaining = received − outward(original) − outward(every continuation)
 *
 * A continuation line has no balance of its own. Reading one as if it did
 * would show it as over-delivered, and would subtract the same pieces twice
 * from stock.
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
 * Outward totals gathered onto the line each ultimately belongs to.
 *
 * Walks the parent links so a continuation of a continuation still lands on
 * the original, and stops if the data ever contains a cycle rather than
 * looping forever.
 */
export function outwardByOriginal(items: ChainItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [id, item] of eachWithRoot(items)) {
    totals.set(id, (totals.get(id) ?? 0) + outwardTotal(item));
  }
  return totals;
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
 * The same gathering, kept split into the three outward columns.
 *
 * The Completed and Stock screens show sent, material problem and rejection
 * separately, and each has to carry the whole chain or the figures stop
 * adding up to what was received.
 */
export function outwardPartsByOriginal(items: ChainItem[]): Map<string, OutwardParts> {
  const totals = new Map<string, OutwardParts>();

  for (const [id, item] of eachWithRoot(items)) {
    const part = totals.get(id) ?? { sent: 0, materialProblem: 0, rejection: 0 };
    part.sent += Number(item.sent_qty) || 0;
    part.materialProblem += Number(item.material_problem_qty) || 0;
    part.rejection += Number(item.rejection_qty) || 0;
    totals.set(id, part);
  }

  return totals;
}

/**
 * What an original line still owes, counting every despatch made against it.
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

/** Every original line with what it still owes, continuations folded in. */
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
 * A challan's outstanding quantity.
 *
 * Only its own original lines count. A challan made purely of continuations
 * owes nothing itself: it is a despatch document, and what it despatched is
 * already subtracted from the challan that received the lot.
 */
export function outstandingForChallan(challanItems: ChainItem[], allItems: ChainItem[]): number {
  const remaining = remainingByLine(allItems);
  return challanItems
    .filter(isOriginalLine)
    .reduce((total, item) => total + (remaining.get(item.id) ?? 0), 0);
}

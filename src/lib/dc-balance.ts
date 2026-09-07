// Reconciliation between what a customer sent us (inward) and what we have
// accounted for back to them (outward).
//
// On a job-work challan every piece received has to end up in exactly one of
// three outward buckets: machined and sent back, returned with a material
// problem, or scrapped as a rejection. Anything left over is still on our
// floor; anything beyond the received count is impossible and means a keying
// error somewhere.

export type DcQuantities = {
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
};

function toCount(value: number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Everything accounted for back to the customer. Mirrors the stored total_qty. */
export function outwardTotal(item: DcQuantities): number {
  return (
    toCount(item.sent_qty) + toCount(item.material_problem_qty) + toCount(item.rejection_qty)
  );
}

/**
 * Received minus outward.
 *
 * Positive: still pending with us, which is normal mid-job.
 * Zero: fully reconciled.
 * Negative: more went out than came in — always an error.
 */
export function balanceQty(item: DcQuantities): number {
  return toCount(item.received_qty) - outwardTotal(item);
}

export function isOverDelivered(item: DcQuantities): boolean {
  return balanceQty(item) < 0;
}

export type OverDeliveredRow = {
  /** 1-based row number as shown to the operator. */
  position: number;
  component: string;
  received: number;
  outward: number;
  /** How many pieces beyond what was received, always positive. */
  extra: number;
};

/** The rows that fail to balance, ready to list back to the operator. */
export function findOverDelivered<T extends DcQuantities & { component: string }>(
  items: T[]
): OverDeliveredRow[] {
  return items.flatMap((item, index) => {
    const balance = balanceQty(item);
    if (balance >= 0) return [];
    return [
      {
        position: index + 1,
        component: item.component.trim() || `Row ${index + 1}`,
        received: toCount(item.received_qty),
        outward: outwardTotal(item),
        extra: -balance,
      },
    ];
  });
}

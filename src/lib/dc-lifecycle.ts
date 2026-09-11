import { balanceQty, type DcQuantities } from "@/lib/dc-balance";
import type { DcStatus } from "@/types/database";

/**
 * Where a challan is in its life: Draft, Active, or Completed.
 *
 * Completion is not a flag somebody remembers to set. A job-work challan is
 * finished when every piece received has been accounted for back to the
 * customer, so it is read off the item rows — the same arithmetic the Stock
 * and Completed screens use, which is why those two can never disagree with
 * the badge on the challan itself.
 */
export type DcLifecycle = "draft" | "active" | "completed";

/**
 * The stored status, with the statuses this app used before migration 0017
 * folded into their replacements.
 *
 * Kept so the app reads correctly whether or not those migrations have been
 * applied yet: an unmigrated row still says "dispatched", and that is Active.
 */
export function normalizeDcStatus(status: DcStatus | string | null | undefined): DcLifecycle {
  switch (status) {
    case "completed":
    case "delivered":
      return "completed";
    case "active":
    case "dispatched":
      return "active";
    default:
      return "draft";
  }
}

/**
 * A challan's real state, from its stored status and its item rows.
 *
 * A draft stays a draft whatever its numbers say — it is not on the books
 * yet. Everything else is Completed once nothing is outstanding on any row,
 * and Active until then.
 */
export function dcLifecycle(
  status: DcStatus | string | null | undefined,
  items: DcQuantities[]
): DcLifecycle {
  const stored = normalizeDcStatus(status);
  if (stored === "draft") return "draft";
  if (items.length === 0) return "active";
  const settled = items.every((item) => balanceQty(item) <= 0);
  return settled ? "completed" : "active";
}

export const DC_LIFECYCLE_LABELS: Record<DcLifecycle, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

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

/**
 * The value to store for a lifecycle the operator has chosen.
 *
 * Deliberately the pre-0017 spellings. They exist in every version of the
 * dc_status type, whereas 'active' and 'completed' exist only once migration
 * 0016 has been applied — and that migration has reported success repeatedly
 * without the type ever gaining them. Writing a label the database may reject
 * makes Confirm challan fail outright; writing one it always accepts costs
 * nothing, because normalizeDcStatus reads both spellings as the same thing
 * and nothing but this function decides what is written.
 *
 * When 0016 does land, this is the single line to change.
 */
export function storedStatusFor(lifecycle: Exclude<DcLifecycle, "completed">): DcStatus {
  return lifecycle === "draft" ? "draft" : "dispatched";
}

export const DC_LIFECYCLE_LABELS: Record<DcLifecycle, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

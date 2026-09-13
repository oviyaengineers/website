/**
 * What the operator is told when saving a delivery challan fails.
 *
 * The save runs as one database transaction (migration 0023), so a failure
 * always means nothing was saved: no challan, no lines, no DC number used, no
 * scan converted. The function raises short coded messages; this turns them
 * into sentences, and says plainly that nothing was kept.
 */
export function saveErrorMessage(message: string | null | undefined, code?: string | null): string {
  const text = message ?? "";

  const scan = text.match(/SCAN_NOT_PENDING:(.*)/);
  if (scan) {
    const to = scan[1].trim();
    return to === "discarded"
      ? "This scanned customer DC was discarded, so a delivery challan cannot be created from it."
      : `A delivery challan has already been created from this scanned customer DC${
          to && to !== "converted" ? ` (${to})` : ""
        }. Open it from Scanned DCs rather than creating another.`;
  }

  const over = text.match(/OVER_DISPATCH:(.*)\|([-\d.]+)\|([-\d.]+)/);
  if (over) {
    return `More is being despatched than remains outstanding: ${over[1]} has ${Number(
      over[2]
    )} left to despatch but ${Number(over[3])} is entered. Nothing was saved.`;
  }

  const below = text.match(/BELOW_FOLLOW_UPS:(.*)\|([-\d.]+)/);
  if (below) {
    return `${below[1]}: follow-up DCs already account for ${Number(
      below[2]
    )}, so the received quantity cannot be reduced below that. Nothing was saved.`;
  }

  if (text.includes("PARENT_LINE_MISSING")) {
    return "The line this follow-up continues no longer exists. Nothing was saved.";
  }
  if (text.includes("DC_NOT_FOUND")) return "That delivery challan no longer exists.";
  if (text.includes("DC_NO_ITEMS")) return "Add at least one item.";
  if (text.includes("DC_NO_CUSTOMER")) return "Please select a customer.";

  if (code === "23503" || /foreign key/i.test(text)) {
    return "A line with follow-up DCs raised against it cannot be removed. Nothing was saved.";
  }
  if (code === "42501" || /permission denied/i.test(text)) {
    return "You are not signed in, or not allowed to save delivery challans. Nothing was saved.";
  }

  return `The delivery challan could not be saved, and nothing was kept. ${
    text ? `(${text})` : "Please try again."
  }`.trim();
}

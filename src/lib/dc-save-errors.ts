import type { Lang } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * What the operator is told when saving a delivery challan fails.
 *
 * The save runs as one database transaction (migration 0023), so a failure
 * always means nothing was saved: no challan, no lines, no DC number used, no
 * scan converted. The function raises short coded messages; this turns them
 * into sentences in the chosen language, and says plainly that nothing was
 * kept. Component names, DC numbers and quantities from the message are
 * passed through unchanged.
 */
export function saveErrorMessage(
  message: string | null | undefined,
  code?: string | null,
  lang: Lang = "en"
): string {
  const t = createTranslator(lang);
  const text = message ?? "";

  const scan = text.match(/SCAN_NOT_PENDING:(.*)/);
  if (scan) {
    const to = scan[1].trim();
    if (to === "discarded") return t("dcErrors.scanDiscarded");
    return to && to !== "converted"
      ? t("dcErrors.scanConvertedTo", { dc: to })
      : t("dcErrors.scanConverted");
  }

  const over = text.match(/OVER_DISPATCH:(.*)\|([-\d.]+)\|([-\d.]+)/);
  if (over) {
    return t("dcErrors.overDispatch", {
      component: over[1],
      left: Number(over[2]),
      entered: Number(over[3]),
    });
  }

  const below = text.match(/BELOW_FOLLOW_UPS:(.*)\|([-\d.]+)/);
  if (below) {
    return t("dcErrors.belowFollowUps", { component: below[1], qty: Number(below[2]) });
  }

  const belowBilled = text.match(/BELOW_BILLED:(.*)\|([-\d.]+)/);
  if (belowBilled) {
    return t("dcErrors.belowBilled", { component: belowBilled[1], qty: Number(belowBilled[2]) });
  }

  const billedRemoved = text.match(/BILLED_LINE_REMOVED:(.*)/);
  if (billedRemoved) {
    return t("dcErrors.billedLineRemoved", { component: billedRemoved[1].trim() });
  }

  // Raised when a line with weight/scrap recorded is removed or its DC deleted (0029).
  const weighedRemoved = text.match(/WEIGHED_LINE_REMOVED:(.*)/);
  if (weighedRemoved) {
    return t("dcErrors.weighedLineRemoved", { component: weighedRemoved[1].trim() });
  }

  const monthLocked = text.match(/DC_BILLED_MONTH_LOCKED: (\S+) is billed for ([^,]+),/);
  if (monthLocked) {
    return t("dcErrors.billedMonthLocked", { dc: monthLocked[1], month: monthLocked[2] });
  }

  if (text.includes("DC_BILLED_CUSTOMER_LOCKED")) return t("dcErrors.billedCustomerLocked");
  if (text.includes("DC_BILLED_CANNOT_REOPEN")) return t("dcErrors.billedCannotReopen");
  if (text.includes("PARENT_LINE_MISSING")) return t("dcErrors.parentLineMissing");
  if (text.includes("DC_NOT_FOUND")) return t("dcErrors.dcNotFound");
  if (text.includes("DC_NO_ITEMS")) return t("dcErrors.noItems");
  if (text.includes("DC_NO_CUSTOMER")) return t("dcErrors.noCustomer");

  if (code === "23503" || /foreign key/i.test(text)) return t("dcErrors.followUpLineInUse");
  if (code === "42501" || /permission denied/i.test(text)) return t("dcErrors.notAllowed");

  return text ? t("dcErrors.genericWithDetail", { detail: text }) : t("dcErrors.generic");
}

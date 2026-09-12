import type { DcRow } from "@/lib/dc-rows";
import type { ScannedDc } from "@/lib/actions/dc-scan-queue";

/**
 * Matching a typed term against a record.
 *
 * The operator types whatever they have to hand: a part number, a material, a
 * customer DC reference, a date as it appears on screen. Rather than asking
 * which field they meant, every field that could carry it is searched, and a
 * partial match counts — "DN40FB" has to find "3P DN40FB/50RB CF8M Body
 * Casting REV 2".
 *
 * These run over rows the database has already narrowed. Anything that can be
 * pushed into SQL is pushed there; this is for the fields that cannot be,
 * such as a quantity or a formatted date.
 */

function haystack(parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ")
    .toLowerCase();
}

/** Every word of the term must appear somewhere, so extra words narrow. */
export function matchesTerm(term: string, parts: (string | number | null | undefined)[]): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const hay = haystack(parts);
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

/** A date in the spellings somebody might type: ISO, and dd MMM yyyy. */
function dateForms(value: string | null | undefined): string[] {
  if (!value) return [];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return [value];
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  const month = parsed.toLocaleString("en-GB", { month: "short" });
  return [value, `${dd}/${mm}/${yyyy}`, `${dd}-${mm}-${yyyy}`, `${dd} ${month} ${yyyy}`];
}

/** Stock and Completed both list item lines, so they search the same way. */
export function dcRowMatches(row: DcRow, term: string): boolean {
  return matchesTerm(term, [
    row.dcNumber,
    row.customerName,
    row.component,
    row.material,
    row.received,
    row.sent,
    row.materialProblem,
    row.rejection,
    row.pending,
    ...row.customerDcNumbers,
    ...row.customerDcDates.flatMap(dateForms),
    ...dateForms(row.dcDate),
  ]);
}

/** A scanned customer DC: its reference, date, and the parts read from it. */
export function scannedDcMatches(scan: ScannedDc, term: string): boolean {
  return matchesTerm(term, [
    scan.customerDcNumber,
    scan.dcNumber,
    ...dateForms(scan.customerDcDate),
    ...dateForms(scan.scannedAt),
    ...scan.items.flatMap((item) => [item.component, item.material, item.received_qty]),
  ]);
}

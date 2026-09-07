// Customer DC reference rules, shared by the form and the server action.
// Kept out of the "use server" module, which may only export async functions.

/**
 * Customer DC numbers repeated on the same challan.
 *
 * Compared case-insensitively so "odc26" and "ODC26" are caught, but the
 * values are returned exactly as entered and never rewritten — the reference
 * has to match the customer's paper, so detection must not normalise it.
 */
/**
 * Fold the characters OCR habitually confuses onto one canonical form, so two
 * readings of the same printed reference compare equal.
 *
 * Only used to *recognise* a reference, never to store one.
 */
export function normaliseDcRef(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S")
    .replace(/8/g, "B");
}

/**
 * Correct a scanned reference against ones already on file.
 *
 * Tesseract reads "ODC26-27/1018" as "0DC26-27/1018" — a zero for the letter
 * O — which leaves the challan carrying a number that does not match the
 * customer's paper. When a stored reference differs only by those confusable
 * characters it is the same printed reference, so the stored spelling wins.
 * Returns null when there is no such evidence, leaving the scan untouched
 * rather than guessing.
 */
export function correctScannedDcRef(scanned: string, stored: string[]): string | null {
  const raw = scanned.trim();
  if (!raw) return null;
  if (stored.some((s) => s.trim() === raw)) return null;

  const key = normaliseDcRef(raw);
  const candidates = [
    ...new Set(stored.map((s) => s.trim()).filter((s) => s && normaliseDcRef(s) === key)),
  ];

  // Only correct when the evidence is unambiguous.
  return candidates.length === 1 ? candidates[0] : null;
}

export function findDuplicateCustomerDcNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const raw of numbers) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) duplicates.add(value);
    seen.add(key);
  }

  return [...duplicates];
}

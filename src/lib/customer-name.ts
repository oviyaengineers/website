/**
 * A customer's name in the fewest words that still say who it is.
 *
 * Lists are read across a narrow column, and the company-form suffix is the
 * part nobody needs to read: "Moreind Automation Private Limited" is found by
 * "Moreind Automation". The suffix is abbreviated rather than dropped, so two
 * companies that differ only by it stay distinguishable. The full name stays
 * on the record and on anything printed for the customer.
 */
export function shortCustomerName(name: string | null | undefined): string {
  if (!name) return "-";
  return name
    .replace(/\bprivate\s+limited\b/gi, "Pvt Ltd")
    .replace(/\bpvt\.?\s*ltd\.?/gi, "Pvt Ltd")
    .replace(/\blimited\b/gi, "Ltd")
    .replace(/\s+/g, " ")
    .trim();
}

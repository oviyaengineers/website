/**
 * The ERP pages that may be turned into a clean PDF by /api/print/pdf.
 *
 * The PDF route opens the page in a server-side browser as the signed-in
 * user, so it must never be pointed anywhere else: only these print pages of
 * this site, with only the query values they use. A future printout joins the
 * system by adding its page here.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type Rule = {
  pattern: RegExp;
  /** Query parameters the page reads, each with the values it may take. */
  query?: Record<string, RegExp>;
  /** What the document is, for the PDF's file name. */
  kind: string;
};

/** Plain filter text: letters, digits, spaces and a few separators, nothing that could be markup or a URL. */
const FILTER_TEXT = /^[\p{L}\p{N} ._,/#()&+-]{0,120}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PRINT_PAGES: Rule[] = [
  { pattern: new RegExp(`^/dashboard/dc/${UUID}/print$`), kind: "DC" },
  {
    pattern: /^\/dashboard\/dc\/combined-print\/print$/,
    query: { ids: new RegExp(`^${UUID}(,${UUID}){0,49}$`), layout: /^(half|full)$/ },
    kind: "Combined-DC",
  },
  { pattern: new RegExp(`^/dashboard/invoices/${UUID}/print$`), kind: "Invoice" },
  {
    pattern: /^\/dashboard\/dc\/history\/print$/,
    query: anyFilter(),
    kind: "DC-History",
  },
  { pattern: /^\/dashboard\/dc\/print-list$/, query: anyFilter(), kind: "DC-List" },
  { pattern: /^\/dashboard\/completed\/print$/, query: anyFilter(), kind: "Completed-DCs" },
  { pattern: /^\/dashboard\/stock\/print$/, query: anyFilter(), kind: "Stock-Balance" },
];

/** List prints take whatever filters their screen offers; values are checked, names are free. */
function anyFilter(): Record<string, RegExp> {
  return new Proxy({} as Record<string, RegExp>, {
    get: (_target, key) =>
      typeof key === "string" && /^[a-zA-Z]{1,32}$/.test(key) ? FILTER_TEXT : undefined,
    has: (_target, key) => typeof key === "string" && /^[a-zA-Z]{1,32}$/.test(key),
  });
}

export type AllowedPrintPage = { path: string; kind: string };

/**
 * The same-site path to render, or null when `requested` is not one of our
 * print pages. Dates keep their own shape; everything else must be plain text.
 */
export function allowedPrintPage(requested: string | null | undefined): AllowedPrintPage | null {
  const raw = (requested ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.length > 4000) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, "https://print.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://print.invalid" || url.hash) return null;

  const rule = PRINT_PAGES.find((r) => r.pattern.test(url.pathname));
  if (!rule) return null;

  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const allowed = rule.query && key in rule.query ? rule.query[key] : undefined;
    if (!allowed) return null;
    if (!(allowed.test(value) || (allowed === FILTER_TEXT && DATE.test(value)))) return null;
    params.append(key, value);
  }
  const query = params.toString();
  return { path: query ? `${url.pathname}?${query}` : url.pathname, kind: rule.kind };
}

/** A safe file name for the PDF, from the page title where there is one. */
export function pdfFileName(kind: string, title: string | null | undefined): string {
  const fromTitle = (title ?? "")
    .split("|")[0]
    .replace(/[^\p{L}\p{N} ._-]+/gu, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${fromTitle || kind}.pdf`;
}

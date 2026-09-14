/**
 * Billing arithmetic shared by the invoice screens.
 *
 * The database is what issues an invoice and its figures are final
 * (create_invoice, migration 0026). These functions reproduce the same rules so
 * the form can show the totals before saving; they never decide what is saved.
 */

export type BillingStatus = "not-billable" | "unbilled" | "partial" | "billed";

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  "not-billable": "Nothing sent",
  unbilled: "Unbilled",
  partial: "Partially Billed",
  billed: "Billed",
};

/** A DC line's billing state from its billable (Sent) and billed quantities. */
export function billingStatus(billable: number, billed: number): BillingStatus {
  if (billable <= 0 && billed <= 0) return "not-billable";
  if (billed <= 0) return "unbilled";
  if (billed < billable) return "partial";
  return "billed";
}

/** A state name compared the way the database compares it: case and spacing ignored. */
export function normalizeState(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Intra-state (CGST + SGST) when the customer is in the company's state. */
export function isIntraState(
  companyState: string | null | undefined,
  customerState: string | null | undefined
) {
  const company = normalizeState(companyState);
  const customer = normalizeState(customerState);
  return Boolean(company) && company === customer;
}

/** Rounds to paise the way Postgres round(x, 2) does for amounts on an invoice. */
export function roundMoney(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
}

export type InvoiceTotalsInput = {
  lines: { quantity: number; rate: number }[];
  charges: { amount: number }[];
  discount: number;
  gstRate: number;
  intra: boolean;
};

export type InvoiceTotals = {
  work: number;
  otherCharges: number;
  subtotal: number;
  discount: number;
  taxable: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  grandTotal: number;
};

/**
 * The invoice's figures: each line rounded to paise, discount taken before
 * tax, then CGST + SGST at half the rate each within the state or IGST at the
 * full rate outside it.
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const work = roundMoney(
    input.lines.reduce((sum, line) => sum + roundMoney(line.quantity * line.rate), 0)
  );
  const otherCharges = roundMoney(
    input.charges.reduce((sum, charge) => sum + roundMoney(charge.amount), 0)
  );
  const subtotal = roundMoney(work + otherCharges);
  const discount = roundMoney(input.discount);
  const taxable = roundMoney(subtotal - discount);
  const cgstRate = input.intra ? input.gstRate / 2 : 0;
  const sgstRate = input.intra ? input.gstRate / 2 : 0;
  const igstRate = input.intra ? 0 : input.gstRate;
  const cgst = roundMoney((taxable * cgstRate) / 100);
  const sgst = roundMoney((taxable * sgstRate) / 100);
  const igst = roundMoney((taxable * igstRate) / 100);
  const tax = roundMoney(cgst + sgst + igst);
  return {
    work,
    otherCharges,
    subtotal,
    discount,
    taxable,
    cgstRate,
    sgstRate,
    igstRate,
    cgst,
    sgst,
    igst,
    tax,
    grandTotal: roundMoney(taxable + tax),
  };
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** A whole number in the Indian system: crore, lakh, thousand. */
export function indianNumberInWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${indianNumberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** "Rupees One Thousand Two Hundred and Paise Fifty Only". */
export function amountInWords(amount: number): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const words = `Rupees ${indianNumberInWords(rupees)}`;
  return paise ? `${words} and Paise ${belowHundred(paise)} Only` : `${words} Only`;
}

/** The next invoice number as the series will issue it, for previews. */
export function formatInvoiceNumber(series: {
  prefix: string;
  fy_label: string;
  padding: number;
  next_serial: number;
}): string {
  return `${series.prefix}${series.fy_label}/${String(series.next_serial).padStart(series.padding, "0")}`;
}

/** Indian rupee formatting for screens: 1,23,456.00. */
export function formatRupees(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The billing month a business date falls in: "2026-09-30" gives "2026-09-01". */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The last day of a billing month: "2026-09-01" gives "2026-09-30". */
export function monthEnd(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** "2026-09-01" or "2026-09" as "September 2026". */
export function formatBillingMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_NAMES[mon - 1] ?? ""} ${year}`.trim();
}

/** A month picker's "2026-09" as the stored "2026-09-01", or null when malformed. */
export function parseMonthInput(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return `${text}-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])-01$/.test(text)) return text;
  return null;
}

/**
 * The default invoice date for a billing month, from today's India date:
 * the month's last day once the month has ended, otherwise today. A month not
 * started yet defaults to its first day, the earliest date allowed.
 */
export function defaultInvoiceDate(month: string, today: string): string {
  const end = monthEnd(month);
  if (today > end) return end;
  if (today < month) return month;
  return today;
}

export type MonthBillingStatus = "no-work" | "unbilled" | "partial" | "billed";

export const MONTH_STATUS_LABELS: Record<MonthBillingStatus, string> = {
  "no-work": "No billable work",
  unbilled: "Unbilled",
  partial: "Partially billed",
  billed: "Fully billed",
};

/** A customer-month's state from its Sent, billed and unbilled totals. */
export function monthBillingStatus(
  sent: number,
  billed: number,
  unbilled: number
): MonthBillingStatus {
  if (sent <= 0) return "no-work";
  if (billed <= 0) return "unbilled";
  if (unbilled > 0) return "partial";
  return "billed";
}

export type SelectedBillingLine = {
  dcItemId: string;
  dcNumber: string;
  component: string;
  componentId: string | null;
  material: string | null;
  quantity: number;
  rate: number;
  hsn: string;
};

export type GroupedInvoiceLine = {
  key: string;
  component: string;
  material: string | null;
  rate: number;
  hsn: string;
  quantity: number;
  amount: number;
  sources: { dcItemId: string; dcNumber: string; quantity: number }[];
};

/**
 * The invoice lines as the database will create them: one per component +
 * material + rate + HSN, each amount rounded once, in the order lines were
 * first selected, keeping every DC line that feeds it.
 */
export function groupInvoiceLines(lines: SelectedBillingLine[]): GroupedInvoiceLine[] {
  const groups = new Map<string, GroupedInvoiceLine>();
  for (const line of lines) {
    const key = [
      line.componentId ?? "",
      line.component,
      line.material ?? "",
      line.rate,
      line.hsn,
    ].join("|");
    const group = groups.get(key) ?? {
      key,
      component: line.component,
      material: line.material,
      rate: line.rate,
      hsn: line.hsn,
      quantity: 0,
      amount: 0,
      sources: [],
    };
    group.quantity += line.quantity;
    group.sources.push({
      dcItemId: line.dcItemId,
      dcNumber: line.dcNumber,
      quantity: line.quantity,
    });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    amount: roundMoney(group.quantity * group.rate),
  }));
}

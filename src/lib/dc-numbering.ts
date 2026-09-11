/** How a DC number prints. Shared by the settings preview and the SQL side. */
export type DcNumberShape = {
  prefix: string;
  fy_label: string;
  padding: number;
  next_serial: number;
};

/** Mirrors format_dc_number() in migration 0015. */
export function previewDcNumber(series: DcNumberShape): string {
  return `${series.prefix}${series.fy_label}-${String(series.next_serial).padStart(series.padding, "0")}`;
}

/**
 * The Indian financial year containing a date, as "26-27".
 *
 * April starts a new one, so a challan raised in March 2027 still belongs to
 * 26-27. Mirrors financial_year_label() in migration 0015.
 */
export function financialYearLabel(on: Date = new Date()): string {
  const year = on.getFullYear();
  const start = on.getMonth() >= 3 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/**
 * Page setup for printing a delivery challan.
 *
 * The site-wide print rule gives every other document an A4 page with 12mm
 * margins, and the challan asks for a margin-free page by name. Some browsers
 * and phone print services ignore named pages, which put the margins back and
 * pushed the halves off the middle of the sheet. Setting the page directly on
 * the challan print screens, after the site rule, holds everywhere, including
 * in the clean PDF made by /api/print/pdf, which obeys the page's own size.
 */
export function DcPrintPageSetup() {
  return <style>{"@media print { @page { size: A4 portrait; margin: 0; } }"}</style>;
}

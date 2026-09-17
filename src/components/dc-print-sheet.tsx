import { LogoMark } from "@/components/marketing/logo";
import { formatDate } from "@/lib/i18n/dates";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";
import type { CustomerRow } from "@/types/database";

/** Rows shown in the items table, padded with blanks when a DC is short. */
const MIN_TABLE_ROWS = 4;

export type PrintItem = {
  id: string;
  component: string;
  material: string | null;
  /** Not printed; carried for the downloaded PDF's data shape. */
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  total_qty: number;
};

export type PrintChallan = {
  id: string;
  dcNumber: string;
  dcDate: string;
  customerDcNumber: string[] | null;
  customerDcDate: (string | null)[] | null;
  authorizedBy: string | null;
  /** SVG markup made by the qrcode library from this challan's public link. */
  qrSvg: string | null;
};

/**
 * The printed delivery challan: ORIGINAL above DUPLICATE on one A4 page.
 *
 * One challan. Several challans of one customer and date are printed together
 * by CombinedDcPrintSheet, which has its own layout, so this one stays exactly
 * as it was.
 */
export function DcPrintSheet({
  challan,
  customer,
  items,
  lang,
  t,
}: {
  challan: PrintChallan;
  customer: CustomerRow | null;
  items: PrintItem[];
  lang: Lang;
  t: Translate;
}) {
  const copy = { challan, customer, items, lang, t };
  return (
    <div className="dc-print-page">
      <DcCopy label={t("dcPrint.original")} {...copy} />
      <div className="dc-print-cut my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400">
        <span className="relative -top-2 bg-white px-2">{t("dcPrint.cutHere")}</span>
      </div>
      <DcCopy label={t("dcPrint.duplicate")} {...copy} />
    </div>
  );
}

/**
 * One ruled cell of the challan form: a small caption above its value.
 *
 * `tall` leaves room to sign by hand. The cell keeps its height whether or
 * not anything was typed into it, because a signature box that collapses when
 * empty is no use on a form somebody has to sign.
 */
export function PrintField({
  label,
  span,
  tall = false,
  children,
}: {
  label: string;
  span: 1 | 2 | 4;
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`dc-print-cell${tall ? " dc-print-cell-tall" : ""}`}
      style={{ gridColumn: `span ${span}` }}
    >
      <p className="dc-print-cell-label">{label}</p>
      <div className="dc-print-cell-value">{children}</div>
    </div>
  );
}

/** The letterhead. Never translated. */
export function PrintLetterhead() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="dc-print-logo mb-1 flex h-12 w-16 items-center justify-center p-1">
        <LogoMark className="h-full w-full" />
      </div>
      <div className="dc-print-company text-xl font-bold tracking-wide">OVIYA ENGINEERS</div>
      <div className="mt-1 text-xs">
        40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
      </div>
      <div className="mt-0.5 text-xs">Ph: 9965902970, 9965702970</div>
    </div>
  );
}

/** Every cell of the items table: a plain ruled box, the same line as the form's. */
export const PRINT_CELL = "border border-[#222] p-1.5";
const CELL = PRINT_CELL;

function DcCopy({
  label,
  challan,
  customer,
  items,
  lang,
  t,
}: {
  label: string;
  challan: PrintChallan;
  customer: CustomerRow | null;
  items: PrintItem[];
  lang: Lang;
  t: Translate;
}) {
  const date = (value: string) => formatDate(value, "dd MMM yyyy", lang);
  // Each customer reference listed once.
  const refs = (challan.customerDcNumber ?? [])
    .map((number, i) => ({ number, date: challan.customerDcDate?.[i] ?? null }))
    .filter(
      (ref, i, all) => all.findIndex((r) => r.number === ref.number && r.date === ref.date) === i
    );
  const authorizedBy = challan.authorizedBy?.trim() ?? "";

  return (
    <div className="dc-print-sheet break-inside-avoid">
      {/* Plain ruled boxes throughout, with no filled band behind the company
          name and no tinted table headings, so the heading reads as one more
          box of the same form. */}
      <header className="relative mb-3 border border-[#222] bg-white px-6 py-3 text-[#172033] print:py-2">
        {/* Top left, balancing the copy label on the right, and absolutely
            placed so the header keeps its height and the page stays one A4. */}
        {challan.qrSvg && (
          <div className="dc-print-qr absolute left-3 top-0.5 flex gap-1">
            <div className="flex items-center gap-0.5">
              <div
                className="dc-print-qr-code"
                // Generated on the server by the qrcode library, never user input.
                dangerouslySetInnerHTML={{ __html: challan.qrSvg }}
              />
              <p className="dc-print-qr-caption">{t("dcPublic.scanToView")}</p>
            </div>
          </div>
        )}
        <div className="absolute right-4 top-4 text-xs">
          <p className="dc-print-copy-label border border-[#222] px-3 py-1 font-semibold tracking-wide">
            {label}
          </p>
        </div>
        <PrintLetterhead />
      </header>

      <section className="dc-print-block mb-3">
        <h2 className="dc-print-title mb-2 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          {t("dcPrint.title")}
        </h2>
        {/* Every field in its own ruled cell, the way a printed challan book
            is laid out: the container carries the top and left edges and each
            cell its right and bottom, so the rules meet with no doubling. */}
        <div className="dc-print-fields">
          <PrintField label={t("dcPrint.ourDcNumber")} span={1}>
            {challan.dcNumber}
          </PrintField>
          <PrintField label={t("dcPrint.date")} span={1}>
            {date(challan.dcDate)}
          </PrintField>
          <PrintField label={t("dcPrint.customerDcNumbers")} span={2}>
            {refs.length > 0
              ? refs.map((ref, i) => (
                  <span key={i} className="block">
                    {ref.number || "-"}
                    {ref.date ? ` (${date(ref.date)})` : ""}
                  </span>
                ))
              : "-"}
          </PrintField>
          <PrintField label={t("dcPrint.customerName")} span={2}>
            <span className="font-medium">{customer?.name ?? "-"}</span>
            {customer?.address ? <span className="block">{customer.address}</span> : null}
          </PrintField>
          <PrintField label={t("dcPrint.contactGst")} span={2}>
            {customer?.phone ? <span className="block">{customer.phone}</span> : null}
            {customer?.gst_number ? (
              <span className="block">{t("dcPrint.gst", { gst: customer.gst_number })}</span>
            ) : null}
            {!customer?.phone && !customer?.gst_number ? "-" : null}
          </PrintField>
        </div>
      </section>

      {/* No block border here: the table draws its own rules, and a bordered
          block around it printed as two concentric rectangles. The caption
          rides in the table's first row instead of floating above it. */}
      <section className="dc-print-block-flush mb-3">
        <div className="dc-print-table-wrap overflow-auto">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            {/* Widths live here, not on the header cells. The table is laid
                out fixed, so the first row decides the columns — and the first
                row is the single merged caption, which squeezed the
                description down to a two-line wrap. A colgroup is immune to
                that. */}
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={7} className={`${CELL} text-center text-sm font-bold text-[#172033]`}>
                  {t("dcPrint.materialDetails")}
                </th>
              </tr>
              <tr>
                <th className={`${CELL} text-center`}>{t("dcPrint.sNo")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.description")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.material")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.qty")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.matProblem")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.rejection")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.total")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className={`${CELL} text-center`}>{idx + 1}</td>
                  <td className={`${CELL} text-center`}>{item.component}</td>
                  <td className={`${CELL} text-center`}>{item.material ?? "-"}</td>
                  {/* The "Qty" column on the printed challan is the sent quantity. */}
                  <td className={`${CELL} text-center`}>{item.sent_qty}</td>
                  <td className={`${CELL} text-center`}>{item.material_problem_qty}</td>
                  <td className={`${CELL} text-center`}>{item.rejection_qty}</td>
                  <td className={`${CELL} text-center`}>{item.total_qty}</td>
                </tr>
              ))}
              {/* Pad short challans out to a consistent form height, but never
                  add filler that would push the second copy onto page two. */}
              {Array.from({
                length: Math.max(0, MIN_TABLE_ROWS - items.length),
              }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  {Array.from({ length: 7 }).map((__, c) => (
                    <td key={c} className={CELL}>
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The standing note and both signatures share one ruled strip, so the
          foot of the challan reads as part of the same form rather than as
          three separate cards. */}
      <section className="dc-print-block dc-print-foot">
        <div className="dc-print-fields">
          <PrintField label={t("dcPrint.note")} span={4}>
            {t("dcPrint.noteText")}
          </PrintField>
          <PrintField label={t("dcPrint.receiverSignature")} span={2} tall>
            {""}
          </PrintField>
          <PrintField
            label={authorizedBy ? t("dcPrint.authorizedBy") : t("dcPrint.authorizedSignatory")}
            span={2}
            tall
          >
            {authorizedBy}
          </PrintField>
        </div>
      </section>
    </div>
  );
}

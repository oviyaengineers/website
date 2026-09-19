import {
  PRINT_CELL,
  PrintField,
  PrintLetterhead,
  PrintTableFiller,
} from "@/components/dc-print-sheet";
import { combinedQrMode, type CombinedLayout, type CombinedRow } from "@/lib/dc-combined-print";
import { formatDate } from "@/lib/i18n/dates";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";
import type { CustomerRow } from "@/types/database";

const COLUMNS = 9;
const CELL = PRINT_CELL;

export type CombinedSourceDc = {
  id: string;
  dcNumber: string;
  dcDate: string;
  authorizedBy: string | null;
  /** This DC's own QR code, when the sheet shows QR codes at all. */
  qrSvg: string | null;
};

type SheetProps = {
  dcs: CombinedSourceDc[];
  rows: CombinedRow[];
  customer: CustomerRow | null;
  lang: Lang;
  t: Translate;
};

/**
 * Several of our DCs for ONE customer on ONE Our DC Date, printed together.
 *
 * half: ORIGINAL above DUPLICATE on one A4 page, in a tighter layout.
 * full: ORIGINAL filling one A4 page and an identical DUPLICATE filling the
 * next, at readable sizes, for selections too long for half a page.
 *
 * Print only. There is no combined DC number and no combined QR code: every
 * source DC number is printed, every line names the DC it is on, and each DC
 * keeps its own QR code (for up to three DCs) or is listed by number. Both
 * copies are rendered from the same props, so they cannot differ.
 */
export function CombinedDcPrintSheet({
  layout,
  ...props
}: SheetProps & { layout: CombinedLayout }) {
  const { t } = props;
  if (layout === "full") {
    return (
      <>
        <div className="dc-print-page dc-print-page-full">
          <CombinedCopy label={t("dcPrint.original")} variant="full" {...props} />
        </div>
        <div className="dc-print-page dc-print-page-full">
          <CombinedCopy label={t("dcPrint.duplicate")} variant="full" {...props} />
        </div>
      </>
    );
  }
  return (
    <div className="dc-print-page dc-print-page-combined">
      <CombinedCopy label={t("dcPrint.original")} variant="half" {...props} />
      <div className="dc-print-cut my-4 border-t border-dashed border-gray-400 text-center text-[10px] uppercase tracking-widest text-gray-400">
        <span className="relative -top-2 bg-white px-2">{t("dcPrint.cutHere")}</span>
      </div>
      <CombinedCopy label={t("dcPrint.duplicate")} variant="half" {...props} />
    </div>
  );
}

function CombinedCopy({
  label,
  variant,
  dcs,
  rows,
  customer,
  lang,
  t,
}: SheetProps & { label: string; variant: CombinedLayout }) {
  const full = variant === "full";
  const mode = combinedQrMode(dcs.length);
  const numbers = dcs.map((dc) => dc.dcNumber).join(", ");
  const dates = [...new Set(dcs.map((dc) => dc.dcDate))]
    .map((value) => formatDate(value, "dd MMM yyyy", lang))
    .join(", ");
  const authorizedBy = [...new Set(dcs.map((dc) => dc.authorizedBy?.trim()).filter(Boolean))].join(
    ", "
  );
  const qrs = mode === "qr" ? dcs.filter((dc) => dc.qrSvg) : [];
  // Pad short prints to a steady form height; a full page has room for more.
  // A full page gives the description more room, so the usual part names stay
  // on one line at the larger, readable size.
  const widths = full ? [4, 9, 11, 37, 8, 7, 9, 8, 7] : [5, 10, 13, 29, 9, 8, 10, 8, 8];

  return (
    <div
      className={`dc-print-sheet ${full ? "dc-print-sheet-full" : "dc-print-sheet-combined"} break-inside-avoid`}
    >
      <header className="relative mb-3 border border-[#222] bg-white px-6 py-3 text-[#172033]">
        {/* One code per source DC, each captioned with its own DC number, so
            none of them can be taken for a code of a combined challan. */}
        {qrs.length > 0 && (
          <div className="dc-print-qr absolute left-3 top-1 flex gap-1">
            {qrs.map((dc) => (
              <div key={dc.id} className="flex flex-col items-center">
                <div
                  className={full ? "dc-print-qr-code-full" : "dc-print-qr-code-combined"}
                  // Generated on the server by the qrcode library, never user input.
                  dangerouslySetInnerHTML={{ __html: dc.qrSvg as string }}
                />
                <p className="dc-print-qr-caption">{dc.dcNumber}</p>
              </div>
            ))}
          </div>
        )}
        <div className="absolute right-4 top-3 text-xs">
          <p className="dc-print-copy-label border border-[#222] px-3 py-1 font-semibold tracking-wide">
            {label}
          </p>
        </div>
        <PrintLetterhead />
      </header>

      <section className="dc-print-block mb-3">
        <h2 className="dc-print-title mb-2 text-center text-lg font-bold text-[#172033] underline underline-offset-4">
          {t("dcCombined.title")}
        </h2>
        <div className="dc-print-fields">
          <PrintField
            label={mode === "qr" ? t("dcCombined.ourDcNumbers") : t("dcCombined.sourceDcs")}
            span={2}
          >
            {numbers}
            {mode === "list" && (
              <span className="dc-print-source-note block">{t("dcCombined.sourceDcsNote")}</span>
            )}
          </PrintField>
          <PrintField label={t("dcPrint.date")} span={2}>
            {dates}
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

      <section className="dc-print-block-flush dc-print-items mb-3">
        <div className="dc-print-table-wrap overflow-auto">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <colgroup>
              {widths.map((width, i) => (
                <col key={i} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  colSpan={COLUMNS}
                  className={`${CELL} text-center text-sm font-bold text-[#172033]`}
                >
                  {t("dcPrint.materialDetails")}
                </th>
              </tr>
              <tr>
                <th className={`${CELL} text-center`}>{t("dcPrint.sNo")}</th>
                <th className={`${CELL} text-center`}>{t("dcCombined.ourDcNo")}</th>
                <th className={`${CELL} text-center`}>{t("dcCombined.customerDcNo")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.description")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.material")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.qty")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.matProblem")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.rejection")}</th>
                <th className={`${CELL} text-center`}>{t("dcPrint.total")}</th>
              </tr>
            </thead>
            <tbody>
              {/* One row per source DC line, never grouped, so every figure
                  can be traced back to the challan it belongs to. */}
              {rows.map((row, idx) => (
                <tr key={row.id}>
                  <td className={`${CELL} text-center`}>{idx + 1}</td>
                  <td className={`${CELL} text-center`}>{row.dcNumber}</td>
                  <td className={`${CELL} text-center`}>
                    {row.customerDcNumbers.join(", ") || "-"}
                  </td>
                  <td className={`${CELL} text-center`}>{row.component}</td>
                  <td className={`${CELL} text-center`}>{row.material ?? "-"}</td>
                  <td className={`${CELL} text-center`}>{row.sent_qty}</td>
                  <td className={`${CELL} text-center`}>{row.material_problem_qty}</td>
                  <td className={`${CELL} text-center`}>{row.rejection_qty}</td>
                  <td className={`${CELL} text-center`}>{row.total_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintTableFiller widths={widths} />
        </div>
      </section>

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

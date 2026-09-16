import { PrintLetterhead } from "@/components/dc-print-sheet";
import { amountInWords, formatRupees, type InvoiceTotals } from "@/lib/billing";
import { formatDate } from "@/lib/i18n/dates";
import type { BuyerSnapshot, CompanyBillingSnapshot } from "@/types/database";

/** The company as printed on every document, the same as the DC letterhead. */
const COMPANY = "OVIYA ENGINEERS";

/** Every ruled box on the bill: the same plain line as the delivery challan. */
const CELL = "border border-[#222] px-2 py-[3px]";

export type InvoiceDocumentData = {
  /** GST Bill ON: TAX INVOICE. OFF: BILL, with no GSTIN, HSN/SAC or tax rows. */
  gst: boolean;
  /** The issued number, or a placeholder on a preview. */
  number: string;
  invoiceDate: string | null;
  dueDate: string | null;
  billingMonth: string;
  placeOfSupply: string | null;
  /** CGST + SGST within the company's state, IGST outside it. */
  intra: boolean;
  seller: CompanyBillingSnapshot | null;
  buyer: BuyerSnapshot | null;
  lines: {
    key: string;
    description: string;
    material: string | null;
    hsn: string | null;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  charges: { key: string; description: string; hsn: string | null; amount: number }[];
  dcs: { dcNumber: string; dcDate: string | null; customerDcNumbers: string[] }[];
  totals: Omit<InvoiceTotals, "work">;
  notes: string | null;
  /** "CANCELLED" on a cancelled invoice, "PREVIEW" before issuing. */
  watermark?: "CANCELLED" | "PREVIEW" | null;
};

/**
 * The customer-facing bill on one A4 page, shared by the print page (from the
 * issued invoice's snapshots) and the preview shown before issuing (from the
 * form), so what is reviewed is exactly what prints. No internal DC balance
 * appears here.
 *
 * It opens with the same letterhead as the delivery challan, and the company
 * named on it is always OVIYA ENGINEERS: the legal name in Billing Details is
 * not printed as the seller, so a wrong entry there cannot put another
 * company's name on the bill. Billing stays in English.
 */
export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const { gst, seller, buyer, totals } = data;
  const day = (value: string | null) =>
    value ? formatDate(value.slice(0, 10), "dd MMM yyyy", "en") : "-";
  const month = formatDate(`${data.billingMonth.slice(0, 7)}-01`, "MMMM yyyy", "en");

  // The total is what matters on the bill. Subtotal and other charges are
  // already the lines of the table above, so they are not repeated. A discount
  // is shown only when one was given, so the lines still add up to the total,
  // and a tax invoice keeps the tax it must show.
  const summaryRows: [string, number][] = [];
  if (totals.discount) summaryRows.push(["Discount", -totals.discount]);
  if (gst) {
    summaryRows.push(["Taxable value", totals.taxable]);
    if (data.intra) {
      summaryRows.push([`CGST @ ${totals.cgstRate}%`, totals.cgst]);
      summaryRows.push([`SGST @ ${totals.sgstRate}%`, totals.sgst]);
    } else {
      summaryRows.push([`IGST @ ${totals.igstRate}%`, totals.igst]);
    }
  }

  const widths = gst ? [6, 38, 10, 10, 9, 11, 16] : [6, 47, 11, 10, 11, 15];
  const headings = gst
    ? ["S.No", "Description", "Material", "HSN/SAC", "Qty", "Rate", "Amount"]
    : ["S.No", "Description", "Material", "Qty", "Rate", "Amount"];
  const hasBank = Boolean(
    seller?.bank_name ||
    seller?.bank_account_name ||
    seller?.bank_account_number ||
    seller?.bank_ifsc ||
    seller?.bank_branch
  );
  const bankParts = [
    seller?.bank_name ? `Bank: ${seller.bank_name}` : null,
    seller?.bank_account_name ? `A/c name: ${seller.bank_account_name}` : null,
    seller?.bank_account_number ? `A/c no.: ${seller.bank_account_number}` : null,
    seller?.bank_ifsc ? `IFSC: ${seller.bank_ifsc}` : null,
    seller?.bank_branch ? `Branch: ${seller.bank_branch}` : null,
  ].filter(Boolean);

  const detail = (label: string, value: string, strong = false) => (
    <>
      <span className="font-semibold">{label}</span>
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </>
  );

  return (
    <div className="invoice-print-page">
      {data.watermark ? (
        <div
          className={`invoice-cancelled-mark ${data.watermark === "PREVIEW" ? "invoice-preview-mark" : ""}`}
        >
          {data.watermark === "PREVIEW" ? "PREVIEW" : "CANCELLED"}
        </div>
      ) : null}

      {/* The delivery challan's own letterhead, in the same ruled box. */}
      <header className="border border-[#222] bg-white px-6 py-2 text-[#172033]">
        <PrintLetterhead />
        {gst && (seller?.gstin || seller?.state) ? (
          <p className="mt-1 text-center text-xs font-semibold">
            {[
              seller?.gstin ? `GSTIN: ${seller.gstin}` : null,
              seller?.state ? `State: ${seller.state}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </header>

      <div className="border-x border-b border-[#222] py-1 text-center text-lg font-bold tracking-[0.2em]">
        {gst ? "TAX INVOICE" : "BILL"}
      </div>

      <div className="grid grid-cols-[1.35fr_1fr] border-x border-b border-[#222]">
        <div className="border-r border-[#222] px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#475569]">
            Bill To
          </p>
          <p className="text-[13px] font-bold">{buyer?.name ?? ""}</p>
          {buyer?.address ? <p className="whitespace-pre-line">{buyer.address.trim()}</p> : null}
          {gst ? (
            <p>
              State: {buyer?.state ?? "-"} · GSTIN: {buyer?.gstin ?? "Unregistered"}
            </p>
          ) : buyer?.state ? (
            <p>State: {buyer.state}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 px-2.5 py-2">
          {detail(gst ? "Invoice No." : "Bill No.", data.number, true)}
          {detail(gst ? "Invoice Date" : "Bill Date", day(data.invoiceDate))}
          {detail("Billing Month", month)}
          {detail("Due Date", day(data.dueDate))}
          {gst ? detail("Place of Supply", data.placeOfSupply ?? "-") : null}
        </div>
      </div>

      {/* The items grow to fill the page, so the totals and signature sit at
          the foot of the sheet whatever the number of lines. */}
      <div className="invoice-items mt-2 flex flex-1 flex-col">
        <table className="w-full border-collapse text-[10.5px]">
          <colgroup>
            {widths.map((width, i) => (
              <col key={i} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {headings.map((heading) => (
                <th key={heading} className={`${CELL} text-center font-semibold`}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, index) => (
              <tr key={line.key}>
                <td className={`${CELL} text-center`}>{index + 1}</td>
                <td className={CELL}>{line.description}</td>
                <td className={`${CELL} text-center`}>{line.material ?? "-"}</td>
                {gst ? <td className={`${CELL} text-center`}>{line.hsn ?? "-"}</td> : null}
                <td className={`${CELL} text-right tabular-nums`}>{line.quantity}</td>
                <td className={`${CELL} text-right tabular-nums`}>{formatRupees(line.rate)}</td>
                <td className={`${CELL} text-right tabular-nums`}>{formatRupees(line.amount)}</td>
              </tr>
            ))}
            {data.charges.map((charge, index) => (
              <tr key={charge.key}>
                <td className={`${CELL} text-center`}>{data.lines.length + index + 1}</td>
                <td className={CELL}>{charge.description}</td>
                <td className={`${CELL} text-center`}>-</td>
                {gst ? <td className={`${CELL} text-center`}>{charge.hsn ?? "-"}</td> : null}
                <td className={`${CELL} text-right`}>-</td>
                <td className={`${CELL} text-right`}>-</td>
                <td className={`${CELL} text-right tabular-nums`}>{formatRupees(charge.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The column lines carry on through the empty space below the last
            line, so the table runs down to the totals like a printed bill
            book instead of stopping short. A table of its own with the same
            columns, stretched to fill, so its lines fall exactly under the
            ones above. */}
        <table className="invoice-items-filler w-full flex-1 border-collapse">
          <colgroup>
            {widths.map((width, i) => (
              <col key={i} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <tbody>
            <tr>
              {widths.map((_, i) => (
                <td key={i} className="border-x border-b border-[#222]" />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {data.dcs.length > 0 ? (
        <div className="mt-2 border border-[#222] px-2.5 py-1 text-[9.5px] leading-snug">
          <span className="font-semibold">{`DCs covered, ${month} (our DC, date, your DC)`}: </span>
          {data.dcs
            .map((dc) =>
              [
                dc.dcNumber,
                dc.dcDate ? formatDate(dc.dcDate, "dd MMM", "en") : null,
                dc.customerDcNumbers.join(", ") || null,
              ]
                .filter(Boolean)
                .join(" ")
            )
            .join("; ")}
        </div>
      ) : null}

      <div className="mt-2 grid break-inside-avoid grid-cols-[1.25fr_1fr] gap-2">
        <div className="flex flex-col gap-2">
          <div className="border border-[#222] px-2.5 py-1.5">
            <p className="font-semibold">Amount in words</p>
            <p>{amountInWords(totals.grandTotal)}</p>
            <p className="mt-0.5 font-semibold">(Labour Charges Only)</p>
          </div>
          {hasBank ? (
            <div className="border border-[#222] px-2.5 py-1.5">
              <p className="font-semibold">{"Bank details"}</p>
              {/* Each label stays on the line with its value. */}
              <p>
                {bankParts.map((part, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    <span className="whitespace-nowrap">{part}</span>
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          {seller?.payment_terms || data.notes ? (
            <div className="border border-[#222] px-2.5 py-1.5">
              <p className="font-semibold">{"Payment / terms"}</p>
              {seller?.payment_terms ? (
                <p className="whitespace-pre-line">{seller.payment_terms}</p>
              ) : null}
              {data.notes ? <p className="whitespace-pre-line">{data.notes}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <table className="w-full border-collapse">
            <tbody>
              {summaryRows.map(([label, value]) => (
                <tr key={label}>
                  <td className={CELL}>{label}</td>
                  <td className={`${CELL} w-[38%] text-right tabular-nums`}>
                    {formatRupees(value)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className={`${CELL} text-[13px] font-bold`}>Total (₹)</td>
                <td className={`${CELL} text-right text-[13px] font-bold tabular-nums`}>
                  {formatRupees(totals.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex min-h-20 flex-1 flex-col justify-between border border-[#222] px-2.5 py-1.5 text-center">
            <p className="font-semibold">{`For ${COMPANY}`}</p>
            <div>
              {seller?.authorized_signatory ? <p>{seller.authorized_signatory}</p> : null}
              <p className="font-semibold">{"Authorised Signatory"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

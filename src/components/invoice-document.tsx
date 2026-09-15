import { format } from "date-fns";
import { amountInWords, formatBillingMonth, formatRupees, type InvoiceTotals } from "@/lib/billing";
import type { BuyerSnapshot, CompanyBillingSnapshot } from "@/types/database";

const day = (value: string | null) =>
  value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "dd MMM yyyy") : "-";

// Compact rows and boxes, so a GST invoice with its HSN column and tax rows
// still fits one A4 with a busy month's lines and DCs.
const CELL = "border border-[#222] px-1.5 py-0.5";

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
 * The customer-facing document on one A4 page, shared by the print page (from
 * the issued invoice's snapshots) and the preview shown before issuing (from
 * the form), so what is reviewed is exactly what prints. No internal DC
 * balance appears here.
 */
export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const { gst, seller, buyer, totals } = data;
  const summaryRows: [string, number][] = [
    ["Subtotal", totals.subtotal],
    ["Other charges (included above)", totals.otherCharges],
    ["Discount", -totals.discount],
  ];
  if (gst) {
    summaryRows.push(["Taxable value", totals.taxable]);
    if (data.intra) {
      summaryRows.push([`CGST @ ${totals.cgstRate}%`, totals.cgst]);
      summaryRows.push([`SGST @ ${totals.sgstRate}%`, totals.sgst]);
    } else {
      summaryRows.push([`IGST @ ${totals.igstRate}%`, totals.igst]);
    }
    summaryRows.push(["Total tax", totals.tax]);
  }

  return (
    <div className="invoice-print-page">
      {data.watermark ? (
        <div
          className={`invoice-cancelled-mark ${data.watermark === "PREVIEW" ? "invoice-preview-mark" : ""}`}
        >
          {data.watermark}
        </div>
      ) : null}

      <div className="border border-[#222]">
        <div className="border-b border-[#222] px-3 py-1 text-center text-base font-bold tracking-wide">
          {gst ? "TAX INVOICE" : "BILL"}
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] text-[10.5px]">
          <div className="border-r border-[#222] px-2 py-1.5">
            <p className="text-sm font-bold">{seller?.legal_name ?? ""}</p>
            {seller?.address ? <p className="whitespace-pre-line">{seller.address}</p> : null}
            <p>State: {seller?.state ?? ""}</p>
            {gst ? <p>GSTIN: {seller?.gstin ?? ""}</p> : null}
            {seller?.phone || seller?.email ? (
              <p>{[seller?.phone, seller?.email].filter(Boolean).join(" · ")}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-[auto_1fr] content-start gap-x-2 px-2 py-1.5">
            <span className="font-semibold">{gst ? "Invoice No." : "Bill No."}</span>
            <span className="font-bold">{data.number}</span>
            <span className="font-semibold">{gst ? "Invoice Date" : "Bill Date"}</span>
            <span>{day(data.invoiceDate)}</span>
            <span className="font-semibold">Billing Month</span>
            <span>{formatBillingMonth(data.billingMonth)}</span>
            <span className="font-semibold">Due Date</span>
            <span>{day(data.dueDate)}</span>
            {gst ? (
              <>
                <span className="font-semibold">Place of Supply</span>
                <span>{data.placeOfSupply ?? "-"}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="border-t border-[#222] px-2 py-1.5 text-[10.5px]">
          <p className="font-semibold">Bill To</p>
          <p className="text-sm font-bold">{buyer?.name ?? ""}</p>
          {buyer?.address ? <p className="whitespace-pre-line">{buyer.address}</p> : null}
          {gst ? (
            <p>
              State: {buyer?.state ?? "-"} · GSTIN: {buyer?.gstin ?? "Unregistered"}
            </p>
          ) : buyer?.state ? (
            <p>State: {buyer.state}</p>
          ) : null}
        </div>
      </div>

      <table className="mt-1.5 w-full border-collapse text-[10px]">
        <colgroup>
          {(gst ? [5, 39, 10, 10, 9, 11, 16] : [5, 49, 10, 9, 11, 16]).map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {(gst
              ? ["S.No", "Description", "Material", "HSN/SAC", "Qty", "Rate", "Amount"]
              : ["S.No", "Description", "Material", "Qty", "Rate", "Amount"]
            ).map((h) => (
              <th key={h} className={`${CELL} text-center font-semibold`}>
                {h}
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
              <td className={`${CELL} text-right`}>{line.quantity}</td>
              <td className={`${CELL} text-right`}>{formatRupees(line.rate)}</td>
              <td className={`${CELL} text-right`}>{formatRupees(line.amount)}</td>
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
              <td className={`${CELL} text-right`}>{formatRupees(charge.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.dcs.length > 0 ? (
        <div className="mt-1.5 border border-[#222] px-2 py-1 text-[9px] leading-snug">
          <span className="font-semibold">
            DCs covered, {formatBillingMonth(data.billingMonth)} (our DC, date, your DC):{" "}
          </span>
          {data.dcs
            .map((dc) =>
              [
                dc.dcNumber,
                dc.dcDate ? format(new Date(`${dc.dcDate}T00:00:00`), "dd MMM") : null,
                dc.customerDcNumbers.join(", ") || null,
              ]
                .filter(Boolean)
                .join(" ")
            )
            .join("; ")}
        </div>
      ) : null}

      <div className="mt-1.5 grid grid-cols-[1.3fr_1fr] gap-1.5 text-[10.5px]">
        <div className="space-y-1.5">
          <div className="border border-[#222] px-2 py-1">
            <p>
              <span className="font-semibold">Amount in words: </span>
              {amountInWords(totals.grandTotal)}
            </p>
          </div>
          <div className="border border-[#222] px-2 py-1">
            <p>
              <span className="font-semibold">Bank: </span>
              {seller?.bank_name ?? "-"} · A/c name: {seller?.bank_account_name ?? "-"}
            </p>
            <p>
              A/c no.: {seller?.bank_account_number ?? "-"} · IFSC: {seller?.bank_ifsc ?? "-"}
              {seller?.bank_branch ? ` · Branch: ${seller.bank_branch}` : ""}
            </p>
          </div>
          {seller?.payment_terms || data.notes ? (
            <div className="border border-[#222] px-2 py-1">
              <p className="font-semibold">Payment / terms</p>
              {seller?.payment_terms ? (
                <p className="whitespace-pre-line">{seller.payment_terms}</p>
              ) : null}
              {data.notes ? <p className="whitespace-pre-line">{data.notes}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <table className="w-full border-collapse">
            <tbody>
              {summaryRows.map(([label, value]) => (
                <tr key={label}>
                  <td className={CELL}>{label}</td>
                  <td className={`${CELL} text-right`}>{formatRupees(value)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${CELL} text-sm font-bold`}>Grand Total (₹)</td>
                <td className={`${CELL} text-right text-sm font-bold`}>
                  {formatRupees(totals.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex h-20 flex-col justify-between border border-[#222] px-2 py-1 text-center">
            <p className="font-semibold">For {seller?.legal_name ?? ""}</p>
            <div>
              {seller?.authorized_signatory ? <p>{seller.authorized_signatory}</p> : null}
              <p className="font-semibold">Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

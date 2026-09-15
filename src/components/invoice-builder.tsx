"use client";

import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerCombobox } from "@/components/customer-combobox";
import { DatePicker } from "@/components/date-picker";
import { BillingStatusBadge } from "@/components/billing-badges";
import {
  amountInWords,
  computeInvoiceTotals,
  defaultInvoiceDate,
  formatBillingMonth,
  formatRupees,
  groupInvoiceLines,
  isIntraState,
} from "@/lib/billing";
import { issueInvoiceAction, type IssueInvoicePayload } from "@/lib/actions/billing";
import type { BillableLine } from "@/lib/billing-data";

export type BuilderCustomer = {
  id: string;
  name: string;
  state: string | null;
  gst_number: string | null;
};

export type BuilderMonth = { month: string; unbilled: number; lines: number };

type Selection = { quantity: string; rate: string; hsn: string };
type Charge = { key: number; description: string; amount: string; hsn: string };

const num = (value: string) => (value.trim() === "" ? NaN : Number(value));

/**
 * Builds one invoice for a customer and a billing month.
 *
 * Only DC lines dated in that month are offered, and each selected line bills
 * part or all of what is still unbilled on it. The rate starts from the Rate
 * List and is changed per DC line only. On review the lines are grouped as the
 * database will issue them: same component, material, rate and HSN/SAC become
 * one invoice line that keeps every DC line it came from. Other charges are
 * invoice-level only. Nothing is saved until Issue invoice, and the database
 * checks availability and recalculates everything again when it is.
 */
export function InvoiceBuilder({
  customers,
  customerId,
  billingMonth,
  months,
  lines,
  today,
  companyState,
  defaultGstRate,
  defaultHsn,
  missingCompany,
  missingCompanyAll,
  nextInvoiceNumber,
  nextBillNumber,
  preselectDcId,
}: {
  customers: BuilderCustomer[];
  customerId: string | null;
  billingMonth: string;
  months: BuilderMonth[];
  lines: BillableLine[];
  /** Today's India date, from the server. */
  today: string;
  companyState: string | null;
  defaultGstRate: number | null;
  defaultHsn: string | null;
  /** Company details a GST tax invoice needs that are not entered yet. */
  missingCompany: string[];
  /** Company details any bill needs that are not entered yet. */
  missingCompanyAll: string[];
  /** Next GST tax invoice number (INV/ series), not yet consumed. */
  nextInvoiceNumber: string | null;
  /** Next normal bill number (BILL/ series), not yet consumed. */
  nextBillNumber: string | null;
  preselectDcId: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(issueInvoiceAction, { error: null });
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const startFor = (line: BillableLine): Selection => ({
    quantity: String(line.unbilled),
    rate: line.listRate === null ? "" : String(line.listRate),
    hsn: line.listHsn ?? defaultHsn ?? "",
  });

  const [selected, setSelected] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(
      lines
        .filter((line) => preselectDcId && line.dcId === preselectDcId && line.unbilled > 0)
        .map((line) => [line.dcItemId, startFor(line)])
    )
  );
  const [charges, setCharges] = useState<Charge[]>([]);
  // OFF unless the operator explicitly chooses a GST tax invoice.
  const [gstBill, setGstBill] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => defaultInvoiceDate(billingMonth, today));
  const [dueDate, setDueDate] = useState("");
  const [gstRate, setGstRate] = useState(defaultGstRate === null ? "" : String(defaultGstRate));
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRequestKey(crypto.randomUUID()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const lineById = useMemo(() => new Map(lines.map((l) => [l.dcItemId, l])), [lines]);
  const visible = lines.filter((line) => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const hay = [line.dcNumber, ...line.customerDcNumbers, line.component, line.material ?? ""]
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  // In the order the lines are listed, so grouping order is stable.
  const chosen = lines.flatMap((line) => {
    const pick = selected[line.dcItemId];
    return pick && lineById.has(line.dcItemId) ? [{ line, ...pick }] : [];
  });

  const problems: string[] = [];
  if (!customer) problems.push("Select the customer.");
  // A normal bill needs only the company name; GSTIN and states only matter for GST.
  const missingNow = gstBill ? missingCompany : missingCompanyAll;
  if (missingNow.length > 0) {
    problems.push(`Enter the ${missingNow.join(", ")} in Settings → Billing Details.`);
  }
  if (gstBill && customer && !customer.state?.trim()) {
    problems.push(`Enter the state for ${customer.name} in Customers (needed for a GST invoice).`);
  }
  if (chosen.length === 0 && charges.length === 0) {
    problems.push("Select at least one DC line or add a charge.");
  }
  for (const c of chosen) {
    const q = num(c.quantity);
    const r = num(c.rate);
    const label = `${c.line.component} on ${c.line.dcNumber}`;
    if (!(q > 0)) problems.push(`Enter a quantity above zero for ${label}.`);
    else if (q > c.line.unbilled) {
      problems.push(`${label} has ${c.line.unbilled} left to bill, but ${q} is entered.`);
    }
    if (!(r >= 0)) problems.push(`Enter the rate for ${label}.`);
    if (gstBill && !c.hsn.trim()) {
      problems.push(`Enter the HSN/SAC for ${label} (needed for a GST invoice).`);
    }
  }
  for (const charge of charges) {
    if (!charge.description.trim()) problems.push("Give each other charge a description.");
    if (!(num(charge.amount) >= 0)) {
      problems.push(`Enter the amount for "${charge.description || "other charge"}".`);
    }
  }
  const gst = num(gstRate);
  if (gstBill && !(gst >= 0 && gst <= 100)) problems.push("Enter the GST rate (0 to 100).");
  const discountValue = num(discount || "0");
  if (!(discountValue >= 0)) problems.push("The discount cannot be negative.");
  if (!invoiceDate) problems.push("Enter the invoice date.");
  else if (invoiceDate < billingMonth) {
    problems.push(`The invoice date cannot be before ${formatBillingMonth(billingMonth)} starts.`);
  }
  if (dueDate && dueDate < invoiceDate)
    problems.push("The due date cannot be before the invoice date.");

  const groups = groupInvoiceLines(
    chosen.map((c) => ({
      dcItemId: c.line.dcItemId,
      dcNumber: c.line.dcNumber,
      component: c.line.component,
      componentId: c.line.componentId,
      material: c.line.material,
      quantity: num(c.quantity) || 0,
      rate: num(c.rate) || 0,
      hsn: c.hsn.trim(),
    }))
  );

  const intra = isIntraState(companyState, customer?.state);
  const totals = computeInvoiceTotals({
    lines: groups.map((g) => ({ quantity: g.quantity, rate: g.rate })),
    charges: charges.map((c) => ({ amount: num(c.amount) || 0 })),
    discount: discountValue || 0,
    gstRate: gst || 0,
    intra,
    gstBill,
  });
  if (totals.discount > totals.subtotal)
    problems.push("The discount cannot be more than the subtotal.");

  const payload: IssueInvoicePayload = {
    customer_id: customer?.id ?? "",
    billing_month: billingMonth,
    invoice_date: invoiceDate,
    due_date: dueDate || null,
    gst_bill: gstBill,
    gst_rate: gstBill && !Number.isNaN(gst) ? gst : null,
    discount: discountValue || 0,
    notes: notes.trim() || null,
    lines: chosen.map((c) => ({
      dc_item_id: c.line.dcItemId,
      quantity: num(c.quantity),
      rate: num(c.rate),
      hsn_sac: c.hsn.trim() || null,
    })),
    charges: charges.map((c) => ({
      description: c.description.trim(),
      amount: num(c.amount),
      hsn_sac: c.hsn.trim() || null,
    })),
  };

  function toggle(line: BillableLine, on: boolean) {
    setSelected((current) => {
      const next = { ...current };
      if (on) next[line.dcItemId] = startFor(line);
      else delete next[line.dcItemId];
      return next;
    });
  }

  function selectAllVisible(on: boolean) {
    setSelected((current) => {
      const next = { ...current };
      for (const line of visible) {
        if (line.unbilled <= 0) continue;
        if (on) next[line.dcItemId] = next[line.dcItemId] ?? startFor(line);
        else delete next[line.dcItemId];
      }
      return next;
    });
  }

  function patch(id: string, change: Partial<Selection>) {
    setSelected((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  function addCharge(description: string) {
    setCharges((rows) => [
      ...rows,
      { key: Date.now() + rows.length, description, amount: "", hsn: "" },
    ]);
  }

  const goTo = (nextCustomer: string, month: string) =>
    router.push(`/dashboard/invoices/new?customer=${nextCustomer}&month=${month.slice(0, 7)}`);

  const taxLabel = !gstBill
    ? "no GST"
    : intra
      ? `CGST ${totals.cgstRate}% + SGST ${totals.sgstRate}%`
      : `IGST ${totals.igstRate}%`;
  const dcLabel = new Map(
    lines.map((l) => [
      l.dcItemId,
      `${l.dcNumber}${l.customerDcNumbers.length ? ` (${l.customerDcNumbers.join(", ")})` : ""}`,
    ])
  );

  if (reviewing) {
    return (
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        <input type="hidden" name="request_key" value={requestKey} />
        <Card className="border-t-4 border-t-[#10233f]">
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">Review before issuing</CardTitle>
            <p className="text-xs text-muted-foreground">
              Nothing is saved yet. This review is not a draft; leaving the page discards it.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <GstBillSwitch
              value={gstBill}
              onChange={setGstBill}
              disabled={pending}
              detail={gstBill ? `Tax: ${taxLabel}.` : "Grand total is the bill value only."}
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <p>
                <span className="text-muted-foreground">
                  {gstBill ? "Invoice number " : "Bill number "}
                </span>
                <span className="font-medium">
                  {(gstBill ? nextInvoiceNumber : nextBillNumber) ?? "Assigned on issue"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Customer </span>
                <span className="font-medium">{customer?.name}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Billing month </span>
                <span className="font-medium">{formatBillingMonth(billingMonth)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Invoice date </span>
                <span className="font-medium">{invoiceDate}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Due date </span>
                <span className="font-medium">{dueDate || "-"}</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              The number shown is the next free one; the database assigns it when the invoice is
              issued.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-2 text-left font-medium">#</th>
                    <th className="p-2 text-left font-medium">Component / Material</th>
                    <th className="p-2 text-left font-medium">HSN/SAC</th>
                    <th className="p-2 text-right font-medium">Qty</th>
                    <th className="p-2 text-right font-medium">Rate</th>
                    <th className="p-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group, index) => (
                    <Fragment key={group.key}>
                      <tr className="border-t align-top">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2">
                          {group.component}
                          <span className="block text-xs text-muted-foreground">
                            {group.material ?? "-"}
                          </span>
                        </td>
                        <td className="p-2">{group.hsn || "-"}</td>
                        <td className="p-2 text-right tabular-nums">{group.quantity}</td>
                        <td className="p-2 text-right tabular-nums">{formatRupees(group.rate)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {formatRupees(group.amount)}
                        </td>
                      </tr>
                      <tr>
                        <td />
                        <td colSpan={5} className="px-2 pb-2 text-xs text-muted-foreground">
                          From{" "}
                          {group.sources
                            .map((s) => `${dcLabel.get(s.dcItemId) ?? s.dcNumber}: ${s.quantity}`)
                            .join(" · ")}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                  {charges.map((c) => (
                    <tr key={c.key} className="border-t">
                      <td className="p-2" />
                      <td className="p-2 text-muted-foreground">Other charge: {c.description}</td>
                      <td className="p-2">{c.hsn || "-"}</td>
                      <td className="p-2" colSpan={2} />
                      <td className="p-2 text-right tabular-nums">{formatRupees(num(c.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Totals totals={totals} taxLabel={taxLabel} intra={intra} gstBill={gstBill} />
            <p className="text-sm">
              <span className="text-muted-foreground">Amount in words: </span>
              {amountInWords(totals.grandTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              Once issued, quantities, rates and tax cannot be edited. A correction is made by
              cancelling the invoice and issuing a new one; the cancelled invoice and its number are
              kept, and its quantities become available to bill again.
            </p>
          </CardContent>
        </Card>
        {problems.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {[...new Set(problems)].map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {state.error && (
          <p className="rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 [&>*]:h-11 sm:[&>*]:h-9">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReviewing(false)}
            disabled={pending}
          >
            <ArrowLeft className="h-4 w-4" /> Back to edit
          </Button>
          <Button
            type="submit"
            disabled={pending || !requestKey || problems.length > 0}
            className="bg-[#10233f] hover:bg-[#10233f]/90"
          >
            {pending ? "Issuing..." : gstBill ? "Issue GST tax invoice" : "Issue bill (no GST)"}
          </Button>
        </div>
      </form>
    );
  }

  const selectable = visible.filter((line) => line.unbilled > 0);
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((line) => selected[line.dcItemId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Customer, month and dates</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Customer *</Label>
            <CustomerCombobox
              customers={customers}
              value={customerId ?? ""}
              onChange={(id) => router.push(`/dashboard/invoices/new?customer=${id}`)}
            />
            {customer ? (
              <p className="text-xs text-muted-foreground">
                State: {customer.state || "not entered"} · GSTIN: {customer.gst_number || "none"}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="billing_month">Billing month *</Label>
            <select
              id="billing_month"
              value={billingMonth}
              disabled={!customer}
              onChange={(e) => customer && goTo(customer.id, e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9"
            >
              {months.map((m) => (
                <option key={m.month} value={m.month}>
                  {formatBillingMonth(m.month)}
                  {m.lines > 0
                    ? ` · ${m.unbilled} unbilled on ${m.lines} line${m.lines === 1 ? "" : "s"}`
                    : " · nothing unbilled"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Only DCs dated in this month can go on this invoice. A month can have more than one
              invoice.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Invoice date *</Label>
            <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>
        </CardContent>
      </Card>

      {missingNow.length > 0 || (gstBill && customer && !customer.state?.trim()) ? (
        <div className="space-y-1 rounded-lg border border-amber-500 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Details needed before issuing
          </p>
          {missingNow.length > 0 ? (
            <p>
              Enter the {missingNow.join(", ")} in{" "}
              <Link href="/dashboard/settings/billing" className="underline">
                Settings → Billing Details
              </Link>
              .
            </p>
          ) : null}
          {gstBill && customer && !customer.state?.trim() ? (
            <p>
              Enter the state for {customer.name} in{" "}
              <Link href={`/dashboard/customers/${customer.id}/edit`} className="underline">
                Customers
              </Link>
              , so CGST + SGST or IGST can be chosen.
            </p>
          ) : null}
        </div>
      ) : null}

      {customer ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base text-[#10233f]">
              Unbilled {formatBillingMonth(billingMonth)} work · {chosen.length} selected
            </CardTitle>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by DC no., customer DC, component or material"
                className="h-11 w-full sm:h-8 sm:w-80"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-8"
                disabled={selectable.length === 0}
                onClick={() => selectAllVisible(!allVisibleSelected)}
              >
                {allVisibleSelected ? "Clear selection" : "Select all shown"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="p-2 text-left font-medium">Bill</th>
                  <th className="p-2 text-left font-medium">Our DC / Date</th>
                  <th className="p-2 text-left font-medium">Customer DC</th>
                  <th className="p-2 text-left font-medium">Component / Material</th>
                  <th className="p-2 text-right font-medium">Sent</th>
                  <th className="p-2 text-right font-medium">Billed</th>
                  <th className="p-2 text-right font-medium">Unbilled</th>
                  <th className="p-2 text-left font-medium">Status</th>
                  <th className="p-2 text-left font-medium">Qty to bill</th>
                  <th className="p-2 text-left font-medium">Rate (this DC line)</th>
                  <th className="p-2 text-left font-medium">HSN/SAC</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => {
                  const pick = selected[line.dcItemId];
                  return (
                    <tr key={line.dcItemId} className="border-b align-top last:border-b-0">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[#10233f]"
                          checked={Boolean(pick)}
                          disabled={line.unbilled <= 0}
                          aria-label={`Bill ${line.component} on ${line.dcNumber}`}
                          onChange={(e) => toggle(line, e.target.checked)}
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Link
                          href={`/dashboard/dc/${line.dcId}`}
                          className="font-medium hover:underline"
                        >
                          {line.dcNumber}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{line.dcDate}</span>
                        {line.followUpOf ? (
                          <span className="block text-xs text-muted-foreground">
                            follow-up of {line.followUpOf}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">{line.customerDcNumbers.join(", ") || "-"}</td>
                      <td className="min-w-[200px] p-2">
                        {line.component}
                        <span className="block text-xs text-muted-foreground">
                          {line.material ?? "-"}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{line.sent}</td>
                      <td className="p-2 text-right tabular-nums">{line.billed}</td>
                      <td className="p-2 text-right font-medium tabular-nums">{line.unbilled}</td>
                      <td className="p-2">
                        <BillingStatusBadge status={line.status} />
                      </td>
                      <td className="p-2">
                        {pick ? (
                          <Input
                            type="number"
                            min="0"
                            max={line.unbilled}
                            step="any"
                            value={pick.quantity}
                            onChange={(e) => patch(line.dcItemId, { quantity: e.target.value })}
                            className="h-9 w-24"
                            aria-label="Quantity to bill"
                          />
                        ) : null}
                      </td>
                      <td className="p-2">
                        {pick ? (
                          <>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={pick.rate}
                              onChange={(e) => patch(line.dcItemId, { rate: e.target.value })}
                              className="h-9 w-28"
                              aria-label="Rate per piece for this DC line"
                            />
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {line.listRate === null
                                ? "No Rate List entry"
                                : num(pick.rate) === line.listRate
                                  ? "From Rate List"
                                  : `Changed for this line (list ${formatRupees(line.listRate)})`}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {pick ? (
                          <Input
                            value={pick.hsn}
                            onChange={(e) => patch(line.dcItemId, { hsn: e.target.value })}
                            className="h-9 w-28"
                            placeholder={gstBill ? "Required" : "Optional"}
                            aria-label="HSN or SAC"
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      {lines.length === 0
                        ? `Nothing from ${formatBillingMonth(billingMonth)} is waiting to be billed for this customer.`
                        : "No DC line matches that filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {customer ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">Other charges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Transport, packing and similar charges for this invoice. They are not tied to any DC
              and never change billed quantities.
            </p>
            {charges.map((charge) => (
              <div
                key={charge.key}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_160px_140px_auto] sm:items-end sm:border-0 sm:p-0"
              >
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input
                    value={charge.description}
                    onChange={(e) =>
                      setCharges((rows) =>
                        rows.map((r) =>
                          r.key === charge.key ? { ...r, description: e.target.value } : r
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={charge.amount}
                    onChange={(e) =>
                      setCharges((rows) =>
                        rows.map((r) =>
                          r.key === charge.key ? { ...r, amount: e.target.value } : r
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">HSN/SAC (optional)</Label>
                  <Input
                    value={charge.hsn}
                    onChange={(e) =>
                      setCharges((rows) =>
                        rows.map((r) => (r.key === charge.key ? { ...r, hsn: e.target.value } : r))
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-destructive sm:h-9 sm:w-9"
                  aria-label="Remove charge"
                  onClick={() => setCharges((rows) => rows.filter((r) => r.key !== charge.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 [&>*]:h-11 sm:[&>*]:h-8">
              {["Transport", "Packing", "Other charges"].map((label) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCharge(label === "Other charges" ? "" : label)}
                >
                  <Plus className="h-4 w-4" /> {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {customer ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">GST, discount and totals</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <GstBillSwitch value={gstBill} onChange={setGstBill} />
              </div>
              {gstBill ? (
                <div className="space-y-2">
                  <Label htmlFor="gst_rate">GST rate (%) *</Label>
                  <Input
                    id="gst_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    placeholder={defaultGstRate === null ? "Enter rate" : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    {customer.state?.trim()
                      ? intra
                        ? "Same state as your company: CGST + SGST."
                        : "Different state from your company: IGST."
                      : "Enter the customer's state to choose the tax."}
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="discount">Discount (₹)</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="any"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Taken off before tax.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes / terms for this invoice</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Totals totals={totals} taxLabel={taxLabel} intra={intra} gstBill={gstBill} />
              {groups.length > 0 ? (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  {chosen.length} DC line{chosen.length === 1 ? "" : "s"} become {groups.length}{" "}
                  invoice line{groups.length === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {customer && problems.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {[...new Set(problems)].map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {customer ? (
        <Button
          type="button"
          disabled={problems.length > 0}
          onClick={() => setReviewing(true)}
          className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9 sm:w-auto"
        >
          Review invoice
        </Button>
      ) : null}
    </div>
  );
}

function Totals({
  totals,
  taxLabel,
  intra,
  gstBill,
}: {
  totals: ReturnType<typeof computeInvoiceTotals>;
  taxLabel: string;
  intra: boolean;
  gstBill: boolean;
}) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "border-t pt-1 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">₹{value}</span>
    </div>
  );
  return (
    <div className="ml-auto max-w-sm space-y-1 rounded-lg border p-4 text-sm">
      {row("DC work", formatRupees(totals.work))}
      {row("Other charges", formatRupees(totals.otherCharges))}
      {row("Subtotal", formatRupees(totals.subtotal))}
      {row("Discount", `-${formatRupees(totals.discount)}`)}
      {gstBill ? (
        <>
          {row("Taxable value", formatRupees(totals.taxable))}
          {intra ? (
            <>
              {row(`CGST ${totals.cgstRate}%`, formatRupees(totals.cgst))}
              {row(`SGST ${totals.sgstRate}%`, formatRupees(totals.sgst))}
            </>
          ) : (
            row(`IGST ${totals.igstRate}%`, formatRupees(totals.igst))
          )}
          {row("Total tax", formatRupees(totals.tax))}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Normal bill: no GST is added.</p>
      )}
      <p className="sr-only">{taxLabel}</p>
      {row("Grand total", formatRupees(totals.grandTotal), true)}
    </div>
  );
}

/**
 * GST Bill ON / OFF for this one invoice. OFF (the default) is a normal bill
 * with no tax; ON is a GST tax invoice. Changing it never touches DC data.
 */
function GstBillSwitch({
  value,
  onChange,
  disabled = false,
  detail,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  detail?: string;
}) {
  return (
    <div
      className={`rounded-lg border-2 p-3 ${
        value
          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30"
          : "border-slate-400 bg-slate-50 dark:bg-slate-900/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">
            GST Bill: {value ? "ON — GST tax invoice" : "OFF — normal bill, no GST"}
          </p>
          <p className="text-xs text-muted-foreground">
            {value
              ? "CGST + SGST or IGST is added. Company GSTIN, both states, GST rate and HSN/SAC are required."
              : "No CGST, SGST or IGST. GSTIN, HSN/SAC and GST rate are not needed."}
            {detail ? ` ${detail}` : ""}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="GST Bill"
          className="inline-flex shrink-0 overflow-hidden rounded-md border bg-background"
        >
          {[false, true].map((option) => (
            <button
              key={String(option)}
              type="button"
              role="radio"
              aria-checked={value === option}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`h-11 min-w-16 px-4 text-sm font-semibold sm:h-9 ${
                value === option ? "bg-[#10233f] text-white" : "text-foreground hover:bg-muted"
              }`}
            >
              {option ? "ON" : "OFF"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

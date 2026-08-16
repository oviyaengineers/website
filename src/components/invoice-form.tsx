"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerCombobox, type ComboboxCustomer } from "@/components/customer-combobox";
import { DatePicker } from "@/components/date-picker";
import { InvoiceItemRows } from "@/components/invoice-item-rows";
import type { InvoiceFormState, InvoiceItemInput } from "@/lib/actions/invoices";
import type { InvoiceRow } from "@/types/database";

export type DcOption = {
  id: string;
  dc_number: string;
  customer_id: string;
  items: InvoiceItemInput[];
};

export function InvoiceForm({
  customers,
  dcs,
  invoice,
  items,
  nextInvoiceNumber,
  action,
}: {
  customers: ComboboxCustomer[];
  dcs?: DcOption[];
  invoice?: InvoiceRow;
  items?: InvoiceItemInput[];
  nextInvoiceNumber?: string | null;
  action: (state: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [customerId, setCustomerId] = useState(invoice?.customer_id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    invoice?.invoice_date ?? new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [dcId, setDcId] = useState(invoice?.dc_id ?? "");
  const [initialItems, setInitialItems] = useState<InvoiceItemInput[] | undefined>(items);
  const [gstRate, setGstRate] = useState(invoice?.gst_rate ?? 18);
  const [discount, setDiscount] = useState(invoice?.discount ?? 0);
  const [totals, setTotals] = useState({ subtotal: 0, gst: 0, grandTotal: 0 });

  const availableDcs = (dcs ?? []).filter((d) => !customerId || d.customer_id === customerId);

  function handleDcSelect(id: string) {
    setDcId(id);
    const dc = (dcs ?? []).find((d) => d.id === id);
    if (dc) {
      setInitialItems(dc.items);
      if (!customerId) setCustomerId(dc.customer_id);
    }
  }

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      <input type="hidden" name="dc_id" value={dcId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Invoice Number</Label>
          <Input
            disabled
            value={invoice?.invoice_number ?? nextInvoiceNumber ?? "Auto-generated"}
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice_date">Invoice Date *</Label>
          <DatePicker value={invoiceDate} onChange={setInvoiceDate} name="invoice_date" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Customer *</Label>
          <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <DatePicker value={dueDate} onChange={setDueDate} name="due_date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Link Delivery Challan (optional)</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          value={dcId}
          onChange={(e) => handleDcSelect(e.target.value)}
        >
          <option value="">None</option>
          {availableDcs.map((dc) => (
            <option key={dc.id} value={dc.id}>
              {dc.dc_number}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Selecting a DC pulls its items into the line items below.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Line Items *</Label>
        <InvoiceItemRows
          key={dcId || "manual"}
          initialItems={initialItems}
          gstRate={gstRate}
          discount={discount}
          onTotalsChange={setTotals}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="gst_rate">GST Rate (%)</Label>
          <Input
            id="gst_rate"
            name="gst_rate"
            type="number"
            min="0"
            step="any"
            value={gstRate}
            onChange={(e) => setGstRate(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discount">Discount (₹)</Label>
          <Input
            id="discount"
            name="discount"
            type="number"
            min="0"
            step="any"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>Grand Total</Label>
          <Input disabled value={`₹${totals.grandTotal.toFixed(2)}`} className="bg-muted font-medium" />
        </div>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-1 max-w-sm ml-auto">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>₹{totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">GST ({gstRate}%)</span>
          <span>₹{totals.gst.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Discount</span>
          <span>-₹{Number(discount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Grand Total</span>
          <span>₹{totals.grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={invoice?.notes ?? ""} />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : invoice ? "Save changes" : "Create invoice"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerCombobox, type ComboboxCustomer } from "@/components/customer-combobox";
import { DatePicker } from "@/components/date-picker";
import {
  DcItemRows,
  emptyDcItemRow,
  isBlankDcItemRow,
  makeDcItemRows,
} from "@/components/dc-item-rows";
import {
  CustomerDcRefs,
  emptyCustomerDcRef,
  makeCustomerDcRefs,
} from "@/components/customer-dc-refs";
import type { DcScanResult } from "@/components/dc-scan-dialog";
import { PENDING_SCAN_EVENT, takePendingScans } from "@/lib/dc-scan-handoff";
import type { StoredDcMatch } from "@/lib/actions/dc-lookup";
import { findOverDelivered } from "@/lib/dc-balance";
import { findDuplicateCustomerDcNumbers } from "@/lib/dc-refs";
import type { DcFormState, DcItemInput } from "@/lib/actions/dc";
import type { DeliveryChallanRow } from "@/types/database";

export function DcForm({
  customers,
  dc,
  items,
  nextDcNumber,
  action,
  components,
  materials,
}: {
  customers: ComboboxCustomer[];
  dc?: DeliveryChallanRow;
  items?: DcItemInput[];
  nextDcNumber?: string | null;
  action: (state: DcFormState, formData: FormData) => Promise<DcFormState>;
  components: string[];
  materials: string[];
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [customerId, setCustomerId] = useState(dc?.customer_id ?? "");
  const [date, setDate] = useState(dc?.dc_date ?? new Date().toISOString().slice(0, 10));
  const [dcRefs, setDcRefs] = useState(() =>
    makeCustomerDcRefs(dc?.customer_dc_number, dc?.customer_dc_date)
  );
  const [itemRows, setItemRows] = useState(() => makeDcItemRows(items));
  const overDelivered = findOverDelivered(itemRows);
  const duplicateRefs = findDuplicateCustomerDcNumbers(dcRefs.map((row) => row.number));

  /**
   * Fold a reviewed scan into the form. Only the ticked values arrive here, so
   * everything present is applied — but nothing already typed is overwritten
   * except the customer, and scanned items are appended rather than replacing
   * work in progress.
   */
  function applyScan(scan: DcScanResult) {
    const applied: string[] = [];

    if (scan.customerId) {
      setCustomerId(scan.customerId);
      applied.push("customer");
    }
    if (scan.customerDcNumber || scan.customerDcDate) {
      const value = {
        number: scan.customerDcNumber ?? "",
        date: scan.customerDcDate ?? "",
      };
      setDcRefs((rows) => {
        const blank = rows.findIndex((row) => !row.number && !row.date);
        return blank >= 0
          ? rows.map((row, i) => (i === blank ? { ...row, ...value } : row))
          : [...rows, { ...emptyCustomerDcRef(), ...value }];
      });
      applied.push("customer DC ref");
    }

    if (scan.items.length > 0) {
      setItemRows((rows) => {
        const kept = rows.filter((row) => !isBlankDcItemRow(row));
        const scanned = scan.items.map((item) => ({
          ...emptyDcItemRow(),
          component: item.component,
          material: item.material,
          received_qty: item.received_qty,
        }));
        return [...kept, ...scanned];
      });
      applied.push(`${scan.items.length} item${scan.items.length === 1 ? "" : "s"}`);
    }

    if (applied.length === 0) {
      toast.info("Nothing was selected to apply.");
    } else {
      toast.success(`Filled in ${applied.join(", ")}. Please check before saving.`);
    }
  }

  /**
   * Copy components and received quantities in from stored challans — either
   * one picked by its customer DC number, or every challan on a customer DC
   * date.
   *
   * The received quantity is what the customer sent in, so it carries over as
   * the starting point; the outward columns stay at zero for this new movement
   * rather than inheriting the old challan's. Rows already filled in are kept,
   * and the same part is never added twice.
   */
  function copyInItems(
    source: { component: string; material: string | null; received_qty: number }[],
    sourceLabel: string
  ) {
    if (source.length === 0) {
      toast.info(`${sourceLabel} has no components to copy.`);
      return;
    }

    // Keyed on component AND material: the same part often comes in under two
    // materials on one date, and those are genuinely separate rows. Keying on
    // the component alone silently dropped the second one.
    const identity = (component: string, material: string | null) =>
      JSON.stringify([component, material ?? ""]);

    let added = 0;
    setItemRows((rows) => {
      const kept = rows.filter((row) => !isBlankDcItemRow(row));
      const already = new Set(kept.map((row) => identity(row.component, row.material)));
      const copied: typeof kept = [];
      for (const item of source) {
        // Guards against both a row already typed in and the same part
        // appearing on two challans of the same date.
        const key = identity(item.component, item.material);
        if (already.has(key)) continue;
        already.add(key);
        copied.push({
          ...emptyDcItemRow(),
          component: item.component,
          material: item.material,
          received_qty: item.received_qty,
        });
      }
      added = copied.length;
      const merged = [...kept, ...copied];
      return merged.length > 0 ? merged : [emptyDcItemRow()];
    });

    // setItemRows runs synchronously here, so `added` is settled by now.
    toast.success(
      added > 0
        ? `Filled ${added} item${added === 1 ? "" : "s"} from ${sourceLabel}. Check the quantities before saving.`
        : `Those components are already on this challan.`
    );
  }

  function useStoredDc(match: StoredDcMatch) {
    copyInItems(match.items, match.dc_number);
  }

  // A scan from the header hands its reviewed result over here — either on
  // arrival, or via the event when this form was already open (scanning
  // mid-entry must not discard what has been typed).
  //
  // Reading in a frame callback rather than the effect body keeps the server
  // and first client render identical, and takePendingScan clears the handoff
  // so a result is applied exactly once.
  useEffect(() => {
    const consume = () => {
      for (const pending of takePendingScans()) applyScan(pending);
    };
    const raf = requestAnimationFrame(consume);
    window.addEventListener(PENDING_SCAN_EVENT, consume);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(PENDING_SCAN_EVENT, consume);
    };
  }, []);

  return (
    <form action={formAction} className="space-y-6 max-w-4xl">
      <Card className="border-t-4 border-t-[#10233f]">
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Delivery Challan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Our DC Number</Label>
            <Input
              disabled
              value={dc?.dc_number ?? nextDcNumber ?? "Assigned on save"}
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dc_date">Date *</Label>
            <DatePicker value={date} onChange={setDate} name="dc_date" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Customer Name *</Label>
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
          <CustomerDcRefs
            rows={dcRefs}
            onRowsChange={setDcRefs}
            excludeDcId={dc?.id}
            customerId={customerId}
            onUseStoredDc={useStoredDc}
            onFillDateComponents={(items, label) => copyInItems(items, `challans dated ${label}`)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Material / Component Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DcItemRows
            rows={itemRows}
            onRowsChange={setItemRows}
            components={components}
            materials={materials}
            excludeDcId={dc?.id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Signature</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="authorized_by">Authorized By / Signature</Label>
            <Input id="authorized_by" name="authorized_by" defaultValue={dc?.authorized_by ?? ""} />
          </div>
        </CardContent>
      </Card>

      {duplicateRefs.length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Duplicate customer DC number
          </h3>
          <p className="text-sm text-destructive">
            {duplicateRefs.join(", ")} {duplicateRefs.length === 1 ? "is" : "are"} listed more than
            once. Remove the extra row before saving.
          </p>
        </div>
      )}

      {overDelivered.length > 0 && (
        <div className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {overDelivered.length} row{overDelivered.length === 1 ? "" : "s"} with more going out
            than came in
          </h3>
          <ul className="space-y-1 text-sm text-destructive">
            {overDelivered.map((row) => (
              <li key={row.position}>
                Row {row.position} — <span className="font-medium">{row.component}</span>: received{" "}
                {row.received}, but sent + material problem + rejection is {row.outward}.{" "}
                <span className="font-medium">{row.extra} extra.</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-destructive/80">
            Correct these before saving — you cannot return more pieces than came in.
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button
        type="submit"
        disabled={pending || overDelivered.length > 0 || duplicateRefs.length > 0}
        className="bg-[#10233f] hover:bg-[#10233f]/90"
      >
        {pending ? "Saving..." : dc ? "Save changes" : "Create delivery challan"}
      </Button>
    </form>
  );
}

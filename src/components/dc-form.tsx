"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { PENDING_SCAN_EVENT } from "@/lib/dc-scan-handoff";
import { getScannedDc, listPendingScans } from "@/lib/actions/dc-scan-queue";
import type { StoredDcMatch } from "@/lib/actions/dc-lookup";
import { findOverDelivered } from "@/lib/dc-balance";
import { findDuplicateCustomerDcNumbers } from "@/lib/dc-refs";
import type { DcFormState, DcItemInput } from "@/lib/actions/dc";
import type { PendingLine } from "@/lib/actions/dc-continuation";
import type { DeliveryChallanRow } from "@/types/database";

export function DcForm({
  customers,
  dc,
  items,
  nextDcNumber,
  action,
  components,
  materials,
  continues,
}: {
  customers: ComboboxCustomer[];
  dc?: DeliveryChallanRow;
  items?: DcItemInput[];
  nextDcNumber?: string | null;
  action: (state: DcFormState, formData: FormData) => Promise<DcFormState>;
  components: string[];
  materials: string[];
  /** Set when this challan continues a pending line on an earlier one. */
  continues?: PendingLine | null;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // A new challan opens on the only customer on file, so the field does not
  // have to be set every time. An existing challan keeps its own customer, and
  // once there is more than one the field starts empty rather than guessing.
  const [customerId, setCustomerId] = useState(
    continues?.customerId ?? dc?.customer_id ?? (customers.length === 1 ? customers[0].id : "")
  );
  const [date, setDate] = useState(dc?.dc_date ?? new Date().toISOString().slice(0, 10));
  const [dcRefs, setDcRefs] = useState(() =>
    continues
      ? // The customer's own reference carries across: this despatch is
        // against the same inward challan as the original.
        makeCustomerDcRefs([continues.customerDcNumber], [continues.customerDcDate])
      : makeCustomerDcRefs(dc?.customer_dc_number, dc?.customer_dc_date)
  );
  const [itemRows, setItemRows] = useState(() =>
    continues
      ? // One row, for the part being continued. Received stays at zero: the
        // pieces came in on the original line, and counting them again would
        // inflate stock.
        [
          {
            ...emptyDcItemRow(),
            component: continues.component,
            material: continues.material,
            received_qty: 0,
            parent_item_id: continues.itemId,
          },
        ]
      : makeDcItemRows(items)
  );
  /** Ticked to save past a customer reference that is already on file. */
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  /** Scans this form instance has already folded in, so none is applied twice. */
  const appliedScanIds = useRef<Set<string>>(new Set());
  // Which scan this challan is being raised from, chosen on Scanned DCs. A
  // scan waits there until somebody picks it, so the form fills from that one
  // rather than sweeping up everything that happens to be queued.
  const wantedScanId = useSearchParams().get("scan");
  /** Scans folded in, so the save can mark exactly those converted. */
  const [usedScanIds, setUsedScanIds] = useState<string[]>([]);
  /**
   * Set when the scan in the URL has already produced a challan.
   *
   * Reachable by the back button or a stale link. The queue only hands back
   * pending scans, so without this the form would simply come up empty and
   * say nothing about why.
   */
  const [alreadyConverted, setAlreadyConverted] = useState<{
    dcId: string | null;
    dcNumber: string | null;
  } | null>(null);
  // A continuation row has no received quantity of its own, so the
  // came-in-versus-went-out rule cannot judge it. It is checked against what
  // its line still owes instead, and again on the server before saving.
  const overDelivered = findOverDelivered(itemRows.filter((row) => !row.parent_item_id));
  const continuedOutward = continues
    ? itemRows
        .filter((row) => row.parent_item_id === continues.itemId)
        .reduce(
          (total, row) =>
            total +
            (Number(row.sent_qty) || 0) +
            (Number(row.material_problem_qty) || 0) +
            (Number(row.rejection_qty) || 0),
          0
        )
    : 0;
  const overContinued = Boolean(continues) && continuedOutward > (continues?.remaining ?? 0);
  const duplicateRefs = findDuplicateCustomerDcNumbers(dcRefs.map((row) => row.number));

  /**
   * Fold a reviewed scan into the form. Only the ticked values arrive here, so
   * everything present is applied — but nothing already typed is overwritten
   * except the customer, and scanned items are appended rather than replacing
   * work in progress.
   */
  function applyScan(scan: DcScanResult, scanId: string) {
    const applied: string[] = [];

    if (scan.customerId) {
      setCustomerId(scan.customerId);
      applied.push("customer");
    }
    if (scan.customerDcNumber || scan.customerDcDate) {
      const value = {
        number: scan.customerDcNumber ?? "",
        date: scan.customerDcDate ?? "",
        sourceScanId: scanId,
      };
      setDcRefs((rows) => {
        // Whatever this same scan put here before is replaced, not added to.
        const others = rows.filter((row) => row.sourceScanId !== scanId);
        const blank = others.findIndex((row) => !row.number && !row.date);
        const next =
          blank >= 0
            ? others.map((row, i) => (i === blank ? { ...row, ...value } : row))
            : [...others, { ...emptyCustomerDcRef(), ...value }];
        return next.length > 0 ? next : [emptyCustomerDcRef()];
      });
      applied.push("customer DC ref");
    }

    if (scan.items.length > 0) {
      setItemRows((rows) => {
        // Rows this scan produced on an earlier visit go first, so replaying
        // the queue re-fills the form instead of doubling it. Rows typed by
        // hand, and rows from other scans, are left alone.
        const kept = rows.filter((row) => !isBlankDcItemRow(row) && row.sourceScanId !== scanId);
        const scanned = scan.items.map((item) => ({
          ...emptyDcItemRow(),
          component: item.component,
          material: item.material,
          received_qty: item.received_qty,
          sourceScanId: scanId,
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
  // The queue is read but NOT emptied: it has to outlive this form, because
  // leaving without saving would otherwise destroy the scans. Applying twice
  // is prevented by id instead. A fresh mount starts with an empty set and so
  // repopulates the form from the queue, which is what should happen when the
  // operator comes back to finish the challan.
  //
  // Reading in a frame callback rather than the effect body keeps the server
  // and first client render identical.
  useEffect(() => {
    const applied = appliedScanIds.current;
    const consume = () => {
      if (!wantedScanId) return;
      void listPendingScans()
        .then(async (waiting) => {
          const match = waiting.find((pending) => pending.id === wantedScanId);
          if (!match) {
            // Not waiting any more. Say why, rather than showing a blank form.
            const scan = await getScannedDc(wantedScanId);
            if (scan?.status === "converted") {
              setAlreadyConverted({ dcId: scan.dcId, dcNumber: scan.dcNumber });
            }
            return;
          }
          if (applied.has(match.id)) return;
          applied.add(match.id);
          applyScan(match, match.id);
          setUsedScanIds((ids) => (ids.includes(match.id) ? ids : [...ids, match.id]));
        })
        .catch(() => {});
    };
    const raf = requestAnimationFrame(consume);
    window.addEventListener(PENDING_SCAN_EVENT, consume);
    // Coming back to this tab is when a scan taken on another device is most
    // likely to be waiting.
    window.addEventListener("focus", consume);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(PENDING_SCAN_EVENT, consume);
      window.removeEventListener("focus", consume);
    };
  }, [wantedScanId]);

  return (
    <form action={formAction} className="space-y-6 max-w-4xl">
      {continues && (
        <Card className="border-t-4 border-t-amber-500 bg-amber-50/60">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="font-medium text-amber-900">Completing work from {continues.dcNumber}</p>
            <p className="text-amber-900">
              {continues.component}
              {continues.material ? ` · ${continues.material}` : ""}
            </p>
            <p className="text-amber-900">
              Received {continues.received} on the original challan. Outstanding now{" "}
              <span className="font-semibold">{continues.remaining}</span>.
            </p>
            <p className="text-xs text-amber-900/80">
              Enter what is going out on this challan. The received quantity stays on the original,
              so the same pieces are never counted twice.
            </p>
          </CardContent>
        </Card>
      )}

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
            outstandingByParent={
              continues ? { [continues.itemId]: continues.remaining } : undefined
            }
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

      {alreadyConverted && (
        <div className="space-y-2 rounded-lg border border-amber-500 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            This scanned customer DC has already been entered
          </h3>
          <p className="text-sm text-amber-900">
            A delivery challan was already created from it
            {alreadyConverted.dcNumber ? ` (${alreadyConverted.dcNumber})` : ""}. Creating another
            would record the same inward lot twice.
          </p>
          {alreadyConverted.dcId && (
            <Button
              render={<Link href={`/dashboard/dc/${alreadyConverted.dcId}`} />}
              variant="outline"
              size="sm"
            >
              Open {alreadyConverted.dcNumber ?? "the delivery challan"}
            </Button>
          )}
        </div>
      )}

      {state.duplicateWarning && (
        <div className="space-y-3 rounded-lg border border-amber-500 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            This challan may already be entered
          </h3>
          <p className="text-sm text-amber-900">{state.duplicateWarning}</p>
          <label className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            Save it anyway — this is a second despatch against the same customer challan.
          </label>
        </div>
      )}
      <input type="hidden" name="allow_duplicate" value={allowDuplicate ? "yes" : "no"} />
      {/* Only the scans that actually filled this form are cleared when it
          saves. Clearing the whole queue would throw away scans nobody has
          entered yet, which is the entire point of the Scanned DCs screen. */}
      {usedScanIds.map((id) => (
        <input key={id} type="hidden" name="used_scan_id" value={id} />
      ))}

      {overContinued && continues && (
        <div className="space-y-1 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            More than remains outstanding
          </h3>
          <p className="text-sm text-destructive">
            {continues.component} has {continues.remaining} left to complete, but {continuedOutward}{" "}
            is entered here. Reduce it before saving.
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button
        type="submit"
        disabled={pending || overDelivered.length > 0 || duplicateRefs.length > 0 || overContinued}
        className="bg-[#10233f] hover:bg-[#10233f]/90"
      >
        {pending ? "Saving..." : dc ? "Save changes" : "Create delivery challan"}
      </Button>
    </form>
  );
}

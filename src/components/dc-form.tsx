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
import { useI18n } from "@/components/i18n-provider";
import { PENDING_SCAN_EVENT } from "@/lib/dc-scan-handoff";
import { getScannedDc, listPendingScans } from "@/lib/actions/dc-scan-queue";
import type { StoredDcMatch } from "@/lib/actions/dc-lookup";
import { findOverDelivered } from "@/lib/dc-balance";
import { indiaToday } from "@/lib/india-date";
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
  followUpRoom,
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
  /**
   * When editing, how much each continued line can still take, keyed by that
   * line's id, with this challan's own rows left out. A new follow-up gets the
   * same figure from `continues`.
   */
  followUpRoom?: Record<string, number>;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, { error: null });
  // A new challan opens on the only customer on file, so the field does not
  // have to be set every time. An existing challan keeps its own customer, and
  // once there is more than one the field starts empty rather than guessing.
  const [customerId, setCustomerId] = useState(
    continues?.customerId ?? dc?.customer_id ?? (customers.length === 1 ? customers[0].id : "")
  );
  const [date, setDate] = useState(dc?.dc_date ?? indiaToday());
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
  /**
   * One key for this form, sent with every save. A double click, a resubmit or
   * a retried request carries the same key, and the database hands back the
   * challan it already saved instead of creating a second one. Made after
   * mount, so the server render and the first client render agree.
   */
  const [requestKey, setRequestKey] = useState("");
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRequestKey(crypto.randomUUID()));
    return () => cancelAnimationFrame(raf);
  }, []);
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
  // its line can still take instead, and again on the server before saving.
  const overDelivered = findOverDelivered(itemRows.filter((row) => !row.parent_item_id));
  // Room left on each continued line: from the follow-up being raised, or
  // from the edit page for a follow-up being changed. Judged against what may
  // still be booked, not the bare balance, because quantity already on draft
  // follow-ups is spoken for.
  const roomByParent: Record<string, number> = {
    ...(followUpRoom ?? {}),
    ...(continues ? { [continues.itemId]: continues.bookable } : {}),
  };
  const overContinuedLines = Object.entries(roomByParent).flatMap(([parentId, room]) => {
    const rows = itemRows.filter((row) => row.parent_item_id === parentId);
    const entered = rows.reduce(
      (total, row) =>
        total +
        (Number(row.sent_qty) || 0) +
        (Number(row.material_problem_qty) || 0) +
        (Number(row.rejection_qty) || 0),
      0
    );
    return entered > room
      ? [{ component: rows[0]?.component ?? "", room: Math.max(0, room), entered }]
      : [];
  });
  const overContinued = overContinuedLines.length > 0;
  const duplicateRefs = findDuplicateCustomerDcNumbers(dcRefs.map((row) => row.number));
  // A row with quantities but no component would otherwise be dropped on save
  // without a word, taking its received quantity with it.
  const unnamedRows = itemRows.filter((row) => !row.component.trim() && !isBlankDcItemRow(row));

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
      applied.push(t("dcForm.appliedCustomer"));
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
      applied.push(t("dcForm.appliedRef"));
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
      applied.push(
        scan.items.length === 1
          ? t("dcForm.appliedItemsOne")
          : t("dcForm.appliedItems", { count: scan.items.length })
      );
    }

    if (applied.length === 0) {
      toast.info(t("dcForm.nothingSelected"));
    } else {
      toast.success(t("dcForm.filledIn", { what: applied.join(", ") }));
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
      toast.info(t("dcForm.noComponentsToCopy", { source: sourceLabel }));
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
      added === 0
        ? t("dcForm.alreadyOnChallan")
        : added === 1
          ? t("dcForm.filledItemsOne", { source: sourceLabel })
          : t("dcForm.filledItems", { count: added, source: sourceLabel })
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
    // applyScan reads the translator, which only changes with the language;
    // a language switch reloads the page, so it is not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedScanId]);

  return (
    <form action={formAction} className="space-y-6 max-w-4xl">
      {continues && (
        <Card className="border-t-4 border-t-amber-500 bg-amber-50/60">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="font-medium text-amber-900">
              {t("dcForm.completingFrom", { dc: continues.dcNumber })}
            </p>
            <p className="text-amber-900">
              {continues.component}
              {continues.material ? ` · ${continues.material}` : ""}
            </p>
            <p className="text-amber-900">
              {t("dcForm.receivedOriginal", {
                received: continues.received,
                remaining: continues.remaining,
              })}
            </p>
            {/* A draft follow-up does not reduce the balance until it is
                confirmed, but its quantity is spoken for, so this challan is
                limited to what is left after it. */}
            {continues.onDraft > 0 && (
              <p className="text-amber-900">
                {t("dcForm.onDraftFollowUp", {
                  onDraft: continues.onDraft,
                  bookable: Math.max(0, continues.bookable),
                })}
              </p>
            )}
            <p className="text-xs text-amber-900/80">{t("dcForm.enterOutgoing")}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-t-4 border-t-[#10233f]">
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">{t("dcDetail.pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>{t("dcForm.ourDcNumber")}</Label>
            <Input
              disabled
              value={dc?.dc_number ?? nextDcNumber ?? t("dcForm.assignedOnSave")}
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dc_date">{t("dcForm.dateRequired")}</Label>
            <DatePicker value={date} onChange={setDate} name="dc_date" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("dcForm.customerNameRequired")}</Label>
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
          <CustomerDcRefs
            rows={dcRefs}
            onRowsChange={setDcRefs}
            excludeDcId={dc?.id}
            customerId={customerId}
            onUseStoredDc={useStoredDc}
            onFillDateComponents={(items, label) =>
              copyInItems(items, t("dcForm.challansDated", { date: label }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">
            {t("dcDetail.materialDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DcItemRows
            rows={itemRows}
            onRowsChange={setItemRows}
            components={components}
            materials={materials}
            excludeDcId={dc?.id}
            outstandingByParent={roomByParent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">{t("dcForm.signature")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="authorized_by">{t("dcForm.authorizedBySignature")}</Label>
            <Input id="authorized_by" name="authorized_by" defaultValue={dc?.authorized_by ?? ""} />
          </div>
        </CardContent>
      </Card>

      {duplicateRefs.length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("dcForm.duplicateRefTitle")}
          </h3>
          <p className="text-sm text-destructive">
            {duplicateRefs.length === 1
              ? t("dcForm.duplicateRefOne", { refs: duplicateRefs.join(", ") })
              : t("dcForm.duplicateRefMany", { refs: duplicateRefs.join(", ") })}
          </p>
        </div>
      )}

      {overDelivered.length > 0 && (
        <div className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {overDelivered.length === 1
              ? t("dcForm.overDeliveredTitleOne")
              : t("dcForm.overDeliveredTitle", { count: overDelivered.length })}
          </h3>
          <ul className="space-y-1 text-sm text-destructive">
            {overDelivered.map((row) => (
              <li key={row.position}>
                {t("dcDetail.rowPrefix", { row: row.position })} —{" "}
                <span className="font-medium">{row.component}</span>
                {t("dcForm.overDeliveredFigures", {
                  received: row.received,
                  outward: row.outward,
                })}{" "}
                <span className="font-medium">{t("dc.list.extra", { count: row.extra })}.</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-destructive/80">{t("dcForm.overDeliveredNote")}</p>
        </div>
      )}

      {alreadyConverted && (
        <div className="space-y-2 rounded-lg border border-amber-500 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {t("dcForm.alreadyConvertedTitle")}
          </h3>
          <p className="text-sm text-amber-900">
            {alreadyConverted.dcNumber
              ? t("dcForm.alreadyConvertedBodyDc", { dc: alreadyConverted.dcNumber })
              : t("dcForm.alreadyConvertedBody")}
          </p>
          {alreadyConverted.dcId && (
            <Button
              render={<Link href={`/dashboard/dc/${alreadyConverted.dcId}`} />}
              variant="outline"
              size="sm"
            >
              {alreadyConverted.dcNumber
                ? t("dcForm.openDc", { dc: alreadyConverted.dcNumber })
                : t("dcForm.openTheDc")}
            </Button>
          )}
        </div>
      )}

      {state.duplicateWarning && (
        <div className="space-y-3 rounded-lg border border-amber-500 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {t("dcForm.mayBeEnteredTitle")}
          </h3>
          <p className="text-sm text-amber-900">{state.duplicateWarning}</p>
          <label className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            {t("dcForm.saveAnyway")}
          </label>
        </div>
      )}
      <input type="hidden" name="allow_duplicate" value={allowDuplicate ? "yes" : "no"} />
      <input type="hidden" name="request_key" value={requestKey} />
      {/* Only the scans that actually filled this form are cleared when it
          saves. Clearing the whole queue would throw away scans nobody has
          entered yet, which is the entire point of the Scanned DCs screen. */}
      {usedScanIds.map((id) => (
        <input key={id} type="hidden" name="used_scan_id" value={id} />
      ))}

      {overContinued && (
        <div className="space-y-1 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("dcForm.overContinuedTitle")}
          </h3>
          {overContinuedLines.map((line) => (
            <p key={line.component} className="text-sm text-destructive">
              {t("dcForm.overContinuedLine", {
                component: line.component,
                room: line.room,
                entered: line.entered,
              })}
            </p>
          ))}
        </div>
      )}

      {unnamedRows.length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive bg-destructive/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("dcForm.chooseComponentTitle")}
          </h3>
          <p className="text-sm text-destructive">
            {unnamedRows.length === 1
              ? t("dcForm.unnamedOne")
              : t("dcForm.unnamedMany", { count: unnamedRows.length })}
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {/* Full width and a full thumb's height on a phone: this is the one
          control that commits the challan, and it was a 150px target. */}
      <Button
        type="submit"
        disabled={
          pending ||
          (!dc && !requestKey) ||
          unnamedRows.length > 0 ||
          overDelivered.length > 0 ||
          duplicateRefs.length > 0 ||
          overContinued
        }
        className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90 sm:h-8 sm:w-auto"
      >
        {pending ? t("common.saving") : dc ? t("dcForm.saveChanges") : t("dcForm.createDc")}
      </Button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FilePlus2, ImageOff, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { CustomerCombobox, type ComboboxCustomer } from "@/components/customer-combobox";
import { SearchableSelect } from "@/components/searchable-select";
import { discardPendingScans, updateScannedDc, type ScannedDc } from "@/lib/actions/dc-scan-queue";
import { PENDING_SCAN_CHANGED } from "@/lib/dc-scan-handoff";

function shortDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

/**
 * One scanned customer DC: the photograph, what OCR read, and the working
 * values our challan will be filled from.
 *
 * View shows all three. Edit changes only the working values: the photograph
 * and the OCR record are never touched, so a correction can always be checked
 * against the paper. Components and materials come from Settings only; a
 * misread name can be corrected to the real part, never kept as a new one.
 * Editing stops once the scan is converted, because from then on the figures
 * live on our challan.
 */
export function ScannedDcEditor({
  scan,
  customers,
  components,
  materials,
  imageUrl,
  editing,
}: {
  scan: ScannedDc;
  customers: ComboboxCustomer[];
  components: string[];
  materials: string[];
  /** A short-lived signed link to the original photograph, when one is stored. */
  imageUrl: string | null;
  /** Edit mode, opened from the Edit button. */
  editing: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const [customerId, setCustomerId] = useState(scan.customerId ?? "");
  const [number, setNumber] = useState(scan.customerDcNumber ?? "");
  const [date, setDate] = useState(scan.customerDcDate ?? "");
  const [items, setItems] = useState(scan.items);

  const pending = scan.status === "pending";
  const canEdit = pending && editing;
  const listed = new Set(components);
  const customerName = (id: string | null | undefined) =>
    customers.find((c) => c.id === id)?.name ?? null;

  const problems = items.flatMap((item, index) => {
    if (!item.component) return [`Row ${index + 1}: choose the component`];
    if (!listed.has(item.component)) {
      return [`Row ${index + 1}: "${item.component}" is not in Settings — choose the correct one`];
    }
    return [];
  });

  function setItem(index: number, patch: Partial<(typeof items)[number]>) {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function save() {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    startSaving(async () => {
      const { error } = await updateScannedDc(scan.id, {
        customerId: customerId || null,
        customerDcNumber: number,
        customerDcDate: date,
        items,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Corrections saved. The scan is still waiting under Scanned DCs.");
      router.push(`/dashboard/dc/scanned/${scan.id}`);
      router.refresh();
    });
  }

  function discard() {
    startDiscarding(async () => {
      const { removed, error } = await discardPendingScans([scan.id]);
      if (error || removed === 0) {
        toast.error(error ?? "That scan is no longer pending, so it was not discarded.");
        return;
      }
      window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
      toast.success("Scan discarded. It is kept under Discarded on Scanned DCs.");
      router.push("/dashboard/dc/scanned");
      router.refresh();
    });
  }

  const read = scan.ocrResult;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">Original scanned image</CardTitle>
          </CardHeader>
          <CardContent>
            {imageUrl ? (
              <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    short-lived signed link to a private file, not a static asset */}
                <img
                  src={imageUrl}
                  alt={`Customer DC ${scan.customerDcNumber ?? ""} as photographed`}
                  className="max-h-[70vh] w-full rounded-md border object-contain"
                />
                <span className="mt-2 block text-xs text-muted-foreground underline">
                  Open full size
                </span>
              </a>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                <ImageOff className="h-5 w-5" />
                {scan.imagePath
                  ? "The image could not be loaded right now. Refresh to try again."
                  : "No image stored. This scan was kept before scan images were saved."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">As read by OCR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {read ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd>{customerName(read.customerId) ?? "Not read"}</dd>
                  <dt className="text-muted-foreground">Customer DC No.</dt>
                  <dd className="font-mono">{read.customerDcNumber ?? "Not read"}</dd>
                  <dt className="text-muted-foreground">Customer DC date</dt>
                  <dd>{read.customerDcDate ? shortDate(read.customerDcDate) : "Not read"}</dd>
                </dl>
                <ul className="space-y-1">
                  {read.items.map((item, index) => (
                    <li key={index} className="rounded border px-2 py-1">
                      {item.component || (
                        <span className="text-muted-foreground">(not matched)</span>
                      )}
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.material ?? "-"} · {item.received_qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">
                No OCR record stored. This scan was kept before OCR results were saved.
              </p>
            )}
            {scan.ocrText ? (
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-muted-foreground">Raw scanned text</summary>
                <pre className="mt-2 max-h-48 overflow-auto text-xs whitespace-pre-wrap">
                  {scan.ocrText}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base text-[#10233f]">
              {canEdit ? "Correct the details" : "Customer DC"}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={`border-transparent ${
                  scan.status === "converted"
                    ? "bg-green-100 text-green-700"
                    : scan.status === "discarded"
                      ? "bg-slate-100 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {scan.status === "converted"
                  ? "Converted"
                  : scan.status === "discarded"
                    ? "Discarded"
                    : "Pending"}
              </Badge>
              {scan.correctedAt ? (
                <Badge variant="outline">Corrected {shortDate(scan.correctedAt)}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 [&_input]:h-11 sm:grid-cols-2 sm:[&_input]:h-8">
            <div className="space-y-2 sm:col-span-2">
              <Label>Customer</Label>
              {canEdit ? (
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  name="scan_customer_id"
                />
              ) : (
                <p className="text-sm">{customerName(scan.customerId) ?? "Not set"}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_dc_number">Customer DC number</Label>
              {canEdit ? (
                <Input
                  id="customer_dc_number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              ) : (
                <p className="text-sm">{scan.customerDcNumber || "Not set"}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Customer DC date</Label>
              {canEdit ? (
                <DatePicker value={date} onChange={setDate} />
              ) : (
                <p className="text-sm">
                  {scan.customerDcDate ? shortDate(scan.customerDcDate) : "Not set"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">Received from the customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Only the received quantity is recorded here. Sent, material
                problem and rejection belong to our challan and start at zero,
                because none of that has happened at scanning time. */}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">No items on this scan.</p>
            )}
            {items.map((item, index) => {
              const unlisted = Boolean(item.component) && !listed.has(item.component);
              return (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border p-3 [&_input]:h-11 sm:grid-cols-[1fr_150px_110px_auto] sm:items-end sm:[&_input]:h-8"
                >
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Component / Description</Label>
                    {canEdit ? (
                      <SearchableSelect
                        options={components}
                        value={unlisted ? null : item.component || null}
                        onChange={(v) => setItem(index, { component: v ?? "" })}
                        placeholder={
                          unlisted ? `Read as "${item.component}" — choose` : "Choose..."
                        }
                        searchPlaceholder="Search components..."
                        emptyText="No component matches. Add it in Settings first."
                        invalid={!item.component || unlisted}
                        ariaLabel="Component"
                      />
                    ) : (
                      <p
                        className={`text-sm ${unlisted || !item.component ? "text-destructive" : ""}`}
                      >
                        {item.component || "Not chosen"}
                        {unlisted ? " (not in Settings)" : ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Material</Label>
                    {canEdit ? (
                      <SearchableSelect
                        options={materials}
                        value={item.material || null}
                        onChange={(v) => setItem(index, { material: v })}
                        searchPlaceholder="Search materials..."
                        allowClear
                        ariaLabel="Material"
                      />
                    ) : (
                      <p className="text-sm">{item.material ?? "-"}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Received</Label>
                    {canEdit ? (
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.received_qty}
                        onChange={(e) =>
                          setItem(index, { received_qty: Math.max(0, Number(e.target.value)) })
                        }
                      />
                    ) : (
                      <p className="text-sm tabular-nums">{item.received_qty}</p>
                    )}
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive sm:h-8 sm:w-8"
                      aria-label={`Remove row ${index + 1}`}
                      onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-8"
                onClick={() =>
                  setItems((rows) => [...rows, { component: "", material: null, received_qty: 0 }])
                }
              >
                <Plus className="h-4 w-4" /> Add a row OCR missed
              </Button>
            ) : null}
            {problems.length > 0 && pending ? (
              <ul className="space-y-1 rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {pending ? (
          <div className="flex flex-wrap gap-2 [&>*]:h-11 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">
            {canEdit ? (
              <>
                <Button onClick={save} disabled={saving || problems.length > 0}>
                  <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save corrections"}
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/scanned/${scan.id}`} />}
                  variant="outline"
                >
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  render={<Link href={`/dashboard/dc/new?scan=${scan.id}`} />}
                  className="bg-[#10233f] hover:bg-[#10233f]/90"
                >
                  <FilePlus2 className="h-4 w-4" /> Create Delivery Challan
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/scanned/${scan.id}?edit=1`} />}
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" onClick={discard} disabled={discarding}>
                  <Trash2 className="h-4 w-4" /> {discarding ? "Discarding..." : "Discard"}
                </Button>
              </>
            )}
          </div>
        ) : scan.status === "converted" ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Our delivery challan has already been created from this.</p>
            <p className="mt-1 text-muted-foreground">
              The figures now live on that challan, so they are edited there rather than here.
            </p>
            {scan.dcId && (
              <Button
                render={<Link href={`/dashboard/dc/${scan.dcId}`} />}
                variant="outline"
                className="mt-3 h-11 sm:h-8"
              >
                Open {scan.dcNumber ?? "the delivery challan"}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            This scan was discarded. It is kept as a record that the customer&apos;s DC was seen,
            but no delivery challan can be created from it.
          </div>
        )}
      </div>
    </div>
  );
}

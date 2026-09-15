"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useI18n } from "@/components/i18n-provider";
import type { Lang } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/dates";

function shortDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDate(value, "dd MMM yyyy", lang);
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
  const { t, lang } = useI18n();
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
    if (!item.component) return [t("dcScan.rowChoose", { row: index + 1 })];
    if (!listed.has(item.component)) {
      return [t("dcScan.rowNotInSettings", { row: index + 1, component: item.component })];
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
      toast.success(t("dcScan.correctionsSaved"));
      router.push(`/dashboard/dc/scanned/${scan.id}`);
      router.refresh();
    });
  }

  function discard() {
    startDiscarding(async () => {
      const { removed, error } = await discardPendingScans([scan.id]);
      if (error || removed === 0) {
        toast.error(error ?? t("dcScan.notDiscarded"));
        return;
      }
      window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
      toast.success(t("dcScan.scanDiscardedToast"));
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
            <CardTitle className="text-base text-[#10233f]">{t("dcScan.originalImage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {imageUrl ? (
              <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    short-lived signed link to a private file, not a static asset */}
                <img
                  src={imageUrl}
                  alt={t("dcScan.photographedAlt", { number: scan.customerDcNumber ?? "" })}
                  className="max-h-[70vh] w-full rounded-md border object-contain"
                />
                <span className="mt-2 block text-xs text-muted-foreground underline">
                  {t("dcScan.openFullSize")}
                </span>
              </a>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                <ImageOff className="h-5 w-5" />
                {scan.imagePath ? t("dcScan.imageNotLoaded") : t("dcScan.noImage")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">{t("dcScan.asReadByOcr")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {read ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">{t("dcScan.fieldCustomer")}</dt>
                  <dd>{customerName(read.customerId) ?? t("dcScan.notRead")}</dd>
                  <dt className="text-muted-foreground">{t("dcScan.fieldCustomerDcNo")}</dt>
                  <dd className="font-mono">{read.customerDcNumber ?? t("dcScan.notRead")}</dd>
                  <dt className="text-muted-foreground">{t("dcScan.fieldCustomerDcDate")}</dt>
                  <dd>
                    {read.customerDcDate
                      ? shortDate(read.customerDcDate, lang)
                      : t("dcScan.notRead")}
                  </dd>
                </dl>
                <ul className="space-y-1">
                  {read.items.map((item, index) => (
                    <li key={index} className="rounded border px-2 py-1">
                      {item.component || (
                        <span className="text-muted-foreground">{t("dcScan.notMatchedParen")}</span>
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
              <p className="text-muted-foreground">{t("dcScan.noOcrRecord")}</p>
            )}
            {scan.ocrText ? (
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("dcScan.rawText")}
                </summary>
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
              {canEdit ? t("dcScan.correctDetails") : t("dcScan.customerDc")}
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
                  ? t("dcScan.statusConverted")
                  : scan.status === "discarded"
                    ? t("dcScan.statusDiscarded")
                    : t("dcScan.statusPending")}
              </Badge>
              {scan.correctedAt ? (
                <Badge variant="outline">
                  {t("dcScan.correctedOn", { date: shortDate(scan.correctedAt, lang) })}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 [&_input]:h-11 sm:grid-cols-2 sm:[&_input]:h-8">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("dcScan.fieldCustomer")}</Label>
              {canEdit ? (
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  name="scan_customer_id"
                />
              ) : (
                <p className="text-sm">{customerName(scan.customerId) ?? t("dcScan.notSet")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_dc_number">{t("dcScan.customerDcNumber")}</Label>
              {canEdit ? (
                <Input
                  id="customer_dc_number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              ) : (
                <p className="text-sm">{scan.customerDcNumber || t("dcScan.notSet")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("dcScan.fieldCustomerDcDate")}</Label>
              {canEdit ? (
                <DatePicker value={date} onChange={setDate} />
              ) : (
                <p className="text-sm">
                  {scan.customerDcDate ? shortDate(scan.customerDcDate, lang) : t("dcScan.notSet")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">
              {t("dcScan.receivedFromCustomer")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Only the received quantity is recorded here. Sent, material
                problem and rejection belong to our challan and start at zero,
                because none of that has happened at scanning time. */}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("dcScan.noItemsOnScan")}</p>
            )}
            {items.map((item, index) => {
              const unlisted = Boolean(item.component) && !listed.has(item.component);
              return (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border p-3 [&_input]:h-11 sm:grid-cols-[1fr_150px_110px_auto] sm:items-end sm:[&_input]:h-8"
                >
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("dcScan.componentDescription")}
                    </Label>
                    {canEdit ? (
                      <SearchableSelect
                        options={components}
                        value={unlisted ? null : item.component || null}
                        onChange={(v) => setItem(index, { component: v ?? "" })}
                        placeholder={
                          unlisted
                            ? t("dcScan.readAsChoose", { component: item.component })
                            : t("dcScan.choose")
                        }
                        searchPlaceholder={t("dcForm.searchComponents")}
                        emptyText={t("dcForm.noComponentMatch")}
                        invalid={!item.component || unlisted}
                        ariaLabel={t("common.component")}
                      />
                    ) : (
                      <p
                        className={`text-sm ${unlisted || !item.component ? "text-destructive" : ""}`}
                      >
                        {item.component || t("dcScan.notChosen")}
                        {unlisted ? t("dcScan.notInSettingsParen") : ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("common.material")}</Label>
                    {canEdit ? (
                      <SearchableSelect
                        options={materials}
                        value={item.material || null}
                        onChange={(v) => setItem(index, { material: v })}
                        searchPlaceholder={t("dcForm.searchMaterials")}
                        allowClear
                        ariaLabel={t("common.material")}
                      />
                    ) : (
                      <p className="text-sm">{item.material ?? "-"}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("dc.qty.received")}</Label>
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
                      aria-label={t("dcScan.removeRowN", { row: index + 1 })}
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
                <Plus className="h-4 w-4" /> {t("dcScan.addMissedRow")}
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
                  <Save className="h-4 w-4" />{" "}
                  {saving ? t("common.saving") : t("dcScan.saveCorrections")}
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/scanned/${scan.id}`} />}
                  variant="outline"
                >
                  <X className="h-4 w-4" /> {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  render={<Link href={`/dashboard/dc/new?scan=${scan.id}`} />}
                  className="bg-[#10233f] hover:bg-[#10233f]/90"
                >
                  <FilePlus2 className="h-4 w-4" /> {t("dcScan.createDc")}
                </Button>
                <Button
                  render={<Link href={`/dashboard/dc/scanned/${scan.id}?edit=1`} />}
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" /> {t("common.edit")}
                </Button>
                <Button variant="destructive" onClick={discard} disabled={discarding}>
                  <Trash2 className="h-4 w-4" />{" "}
                  {discarding ? t("dcScan.discarding") : t("dcScan.discard")}
                </Button>
              </>
            )}
          </div>
        ) : scan.status === "converted" ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">{t("dcScan.convertedTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("dcScan.convertedBody")}</p>
            {scan.dcId && (
              <Button
                render={<Link href={`/dashboard/dc/${scan.dcId}`} />}
                variant="outline"
                className="mt-3 h-11 sm:h-8"
              >
                {scan.dcNumber ? t("dcForm.openDc", { dc: scan.dcNumber }) : t("dcForm.openTheDc")}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {t("dcScan.discardedBody")}
          </div>
        )}
      </div>
    </div>
  );
}

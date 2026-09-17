"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, ImageUp, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { scanChallan, type ImageQuality, type ScanProgress } from "@/lib/ocr/recognize";
import type { ScannedInwardDc } from "@/lib/ocr/parse-inward-dc";
import type { FieldConfidence } from "@/lib/ocr/combine";
import { SearchableSelect } from "@/components/searchable-select";
import { uploadProcessedScanImage, uploadScanImage } from "@/lib/scan-image";
import { PENDING_SCAN_CHANGED } from "@/lib/dc-scan-handoff";
import { countPendingScans, discardPendingScans } from "@/lib/actions/dc-scan-queue";
import {
  correctScannedCustomerDcNumber,
  findDcsByCustomerRef,
  type StoredDcMatch,
} from "@/lib/actions/dc-lookup";
import { formatDcDate, StoredDcMatchList } from "@/components/dc-ref-lookup";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import { useI18n } from "@/components/i18n-provider";

export type ScannedItemSelection = {
  component: string;
  material: string | null;
  received_qty: number;
};

export type DcScanResult = {
  customerId: string | null;
  customerDcNumber: string | null;
  customerDcDate: string | null;
  items: ScannedItemSelection[];
};

/** A kept scan: the reviewed values, plus what it was read from. */
export type DcScanCapture = DcScanResult & {
  /** The original photograph in the private dc-scans bucket. */
  imagePath: string | null;
  /** The prepared image OCR read, stored apart from the original. */
  processedImagePath?: string | null;
  /** The raw text OCR returned. */
  ocrText: string | null;
  /** The values as OCR read them, before the operator changed anything. */
  ocrResult: DcScanResult | null;
};

/** Below this a matched component is flagged for checking against the paper. */
const LOW_CONFIDENCE = 0.85;

type Stage = "idle" | "working" | "review";

type ReviewItem = ScannedItemSelection & {
  key: number;
  include: boolean;
  confidence: number;
  /** Readings did not agree, or the match was loose: shown for checking. */
  verify: boolean;
  rawLine: string;
};

type FieldKey = "customerId" | "customerDcNumber" | "customerDcDate";

/** Shared look for the two capture tiles; each wraps its own file input. */
const TILE =
  "relative flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

/** Quoted in the warning, so the number the operator sees matches the check. */
const MIN_READABLE_PX = 1500;

/** How far along the bar each stage starts. */
function progressShare(progress: ScanProgress | null): number {
  if (!progress) return 0.03;
  if (progress.stage === "improving") return 0.1;
  if (progress.stage === "matching") return 0.92;
  const passes = progress.passes ?? 1;
  return 0.2 + (0.7 * ((progress.pass ?? 1) - 1)) / passes;
}

export function DcScanDialog({
  customers,
  components,
  materials,
  onApply,
  excludeDcId,
  compact = false,
}: {
  customers: ComboboxCustomer[];
  components: string[];
  materials: string[];
  /**
   * Takes the reviewed scan. Awaited, and false means it was not kept — the
   * dialog must not report a capture that never happened.
   */
  onApply: (result: DcScanCapture) => boolean | Promise<boolean>;
  /** The challan being edited, so it is not reported as its own duplicate. */
  excludeDcId?: string | null;
  /** Icon-only trigger, for the dashboard header bar. */
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** How good the photograph was, so a bad one can be called out. */
  const [quality, setQuality] = useState<ImageQuality | null>(null);
  const [rawText, setRawText] = useState("");
  /** What OCR read, kept unchanged as the record of the first reading. */
  const [scan, setScan] = useState<ScannedInwardDc | null>(null);
  /** The values as the operator has them now; every one can be edited. */
  const [values, setValues] = useState<Record<FieldKey, string>>({
    customerId: "",
    customerDcNumber: "",
    customerDcDate: "",
  });
  const [fieldConfidence, setFieldConfidence] = useState<Record<FieldKey, FieldConfidence>>({
    customerId: "verify",
    customerDcNumber: "verify",
    customerDcDate: "verify",
  });
  const [poorQuality, setPoorQuality] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  /** The photograph as chosen, kept so the original can be stored with the scan. */
  const originalFile = useRef<File | null>(null);
  /** The prepared image the reading came from, stored beside the original. */
  const processedBlob = useRef<Blob | null>(null);
  const [storing, setStoring] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Challans captured since this dialog was opened. */
  const [captured, setCaptured] = useState(0);
  const [correctedFrom, setCorrectedFrom] = useState<string | null>(null);
  const [refMatches, setRefMatches] = useState<{
    basis: "both" | "number" | "date";
    matches: StoredDcMatch[];
  } | null>(null);

  // The queue lives on the server now, so the count is fetched rather than
  // read synchronously: on mount, whenever it changes here, and when the window
  // regains focus, which is when another device's scan is most likely waiting.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void countPendingScans()
        .then((n) => {
          if (!cancelled) setWaiting(n);
        })
        .catch(() => {});
    };
    const raf = requestAnimationFrame(refresh);
    window.addEventListener(PENDING_SCAN_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener(PENDING_SCAN_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function reset() {
    setStage("idle");
    setProgress(null);
    setError(null);
    setPreviewUrl(null);
    setQuality(null);
    setRawText("");
    setScan(null);
    setItems([]);
    setValues({ customerId: "", customerDcNumber: "", customerDcDate: "" });
    setPoorQuality(false);
    originalFile.current = null;
    processedBlob.current = null;
    setRefMatches(null);
    setCorrectedFrom(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Look for challans already stored against the scanned reference, so a
   * challan does not get entered twice.
   *
   * OCR mangles characters — a capital O reads as a zero often enough that an
   * exact match on both fields can miss a genuine duplicate. So the strongest
   * criterion is tried first and the result records which one actually
   * matched, rather than quietly widening the search.
   */
  async function lookupExisting(number: string | null, date: string | null) {
    if (!number && !date) {
      setRefMatches(null);
      return;
    }
    try {
      if (number && date) {
        const both = await findDcsByCustomerRef({ number, date, excludeDcId });
        if (both.length > 0) return setRefMatches({ basis: "both", matches: both });
      }
      if (number) {
        const byNumber = await findDcsByCustomerRef({ number, excludeDcId });
        if (byNumber.length > 0) return setRefMatches({ basis: "number", matches: byNumber });
      }
      if (date) {
        const byDate = await findDcsByCustomerRef({ date, excludeDcId });
        if (byDate.length > 0) return setRefMatches({ basis: "date", matches: byDate });
      }
      setRefMatches(null);
    } catch {
      setRefMatches(null);
    }
  }

  /**
   * Reads a photograph. `thorough` is Try OCR again: the same original photo,
   * read with the extra sharpened pass as well. A new photo (Retake, Upload a
   * better image) replaces the original that will be stored.
   */
  async function handleFile(file: File | undefined, thorough = false) {
    if (!file) return;
    originalFile.current = file;
    processedBlob.current = null;

    setStage("working");
    setError(null);
    setProgress(null);

    try {
      const result = await scanChallan(
        file,
        { customers, components, materials, thorough },
        setProgress
      );
      const parsed = result.reading;
      setPreviewUrl(result.previewUrl);
      setQuality(result.quality);
      processedBlob.current = result.processedBlob;
      setPoorQuality(parsed.poorQuality);

      const text = parsed.bestText;
      setRawText(text);

      // OCR reads a letter O as a zero often enough to leave the challan
      // carrying a reference that does not match the customer paper. If one
      // already on file differs only by those characters, take its spelling.
      let dcNumber = parsed.customerDcNumber;
      if (dcNumber) {
        const corrected = await correctScannedCustomerDcNumber(dcNumber);
        if (corrected) {
          setCorrectedFrom(dcNumber);
          dcNumber = corrected;
        } else {
          setCorrectedFrom(null);
        }
      }
      const resolved = { ...parsed, customerDcNumber: dcNumber };

      setScan(resolved);
      setValues({
        customerId: resolved.customerId ?? "",
        customerDcNumber: resolved.customerDcNumber ?? "",
        customerDcDate: resolved.customerDcDate ?? "",
      });
      setFieldConfidence(parsed.fieldConfidence);
      void lookupExisting(resolved.customerDcNumber, resolved.customerDcDate);
      setItems([
        ...parsed.items.map((item, index) => ({
          key: index,
          include: true,
          component: item.component,
          material: item.material,
          received_qty: item.received_qty,
          confidence: item.confidence,
          verify: parsed.itemConfidence[index] !== "high",
          rawLine: item.rawLine,
        })),
        // A description that matches nothing in Settings becomes a row whose
        // component is chosen from the list by hand. It is never added to the
        // list: a misreading must not turn into a part of its own.
        ...parsed.newComponents.map((candidate, index) => ({
          key: parsed.items.length + index,
          include: true,
          component: "",
          material: candidate.material,
          received_qty: candidate.received_qty,
          confidence: 0,
          verify: true,
          rawLine: candidate.rawLine,
        })),
      ]);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dcScan.readFailed"));
      setStage("idle");
    }
  }

  async function apply() {
    if (!scan) return;

    const keptItems = items.filter((item) => item.include);
    const unpicked = keptItems.filter((item) => !item.component.trim());
    if (unpicked.length > 0) {
      toast.error(
        unpicked.length === 1
          ? t("dcScan.chooseForRowsOne")
          : t("dcScan.chooseForRows", { count: unpicked.length })
      );
      return;
    }

    setStoring(true);

    // The original photograph is stored first. If it cannot be, the scan is
    // not kept: a scan whose image is missing cannot be checked against the
    // paper later, and saying "captured" would hide that.
    let imagePath: string | null = null;
    if (originalFile.current) {
      try {
        imagePath = await uploadScanImage(originalFile.current, t("dcErrors.imagePrepare"));
      } catch (e) {
        toast.error(
          t("dcScan.photoNotStored", {
            error: e instanceof Error ? e.message : t("dcScan.unknownError"),
          })
        );
        setStoring(false);
        return;
      }
    }

    // The prepared image goes beside it. Useful for checking a reading, but not
    // what the scan depends on, so failing to store it does not stop the scan.
    let processedImagePath: string | null = null;
    if (processedBlob.current) {
      processedImagePath = await uploadProcessedScanImage(processedBlob.current).catch(() => null);
    }

    // Awaited: the queue is on the server, so this can fail, and reporting a
    // capture that did not happen is exactly how scans were lost before.
    const kept = await onApply({
      customerId: values.customerId || null,
      customerDcNumber: values.customerDcNumber.trim() || null,
      customerDcDate: values.customerDcDate || null,
      items: keptItems.map(({ component, material, received_qty }) => ({
        component,
        material,
        received_qty,
      })),
      imagePath,
      processedImagePath,
      ocrText: rawText,
      // What OCR read, before anybody changed it. Kept beside the corrected
      // values so a correction can always be traced back.
      ocrResult: {
        customerId: scan.customerId,
        customerDcNumber: correctedFrom ?? scan.customerDcNumber,
        customerDcDate: scan.customerDcDate,
        items: [
          ...scan.items.map(({ component, material, received_qty }) => ({
            component,
            material,
            received_qty,
          })),
          ...scan.newComponents.map(({ name, material, received_qty }) => ({
            component: name,
            material,
            received_qty,
          })),
        ],
      },
    });
    setStoring(false);
    // The review stays on screen so the scan can be kept again once whatever
    // refused it is fixed.
    if (!kept) return;

    // Return to the capture step instead of closing: several challans are
    // often photographed in one go, and each adds to the same new DC.
    setCaptured((n) => n + 1);
    reset();
  }

  const detectedFields: {
    key: FieldKey;
    label: string;
    value: string | null;
    /** Shown instead of the value, saying what to do about the gap. */
    missingHint: string;
  }[] = scan
    ? [
        {
          key: "customerId",
          label: t("dcScan.fieldCustomer"),
          value: scan.customerName,
          missingHint: t("dcScan.missingCustomer"),
        },
        {
          key: "customerDcNumber",
          label: t("dcScan.fieldCustomerDcNo"),
          value: scan.customerDcNumber,
          missingHint: t("dcScan.missingNumber"),
        },
        {
          key: "customerDcDate",
          label: t("dcScan.fieldCustomerDcDate"),
          value: scan.customerDcDate,
          missingHint: t("dcScan.missingDate"),
        },
      ]
    : [];
  const foundFields = detectedFields.filter((field) => field.value);
  // Only the lines that yielded nothing usable; anything with a readable
  // description became an item or a new component name instead.
  const unreadableLines = scan?.unmatchedLines ?? [];
  const nothingFound =
    scan !== null &&
    foundFields.length === 0 &&
    items.length === 0 &&
    scan.unmatchedLines.length === 0;

  /**
   * The customer read off the paper against the customer on the challans
   * already stored under this reference.
   *
   * A disagreement usually means the reference was matched to the wrong
   * customer's challan, which would attach these goods to the wrong account —
   * worth stopping for, so it is reported rather than quietly accepted.
   */
  const storedCustomerNames = refMatches
    ? [
        ...new Set(
          refMatches.matches
            .map((m) => m.customer_name)
            .filter((name): name is string => Boolean(name))
        ),
      ]
    : [];
  const scannedCustomer = scan?.customerName ?? null;
  const customerMismatch =
    scannedCustomer &&
    storedCustomerNames.length > 0 &&
    !storedCustomerNames.some((name) => name.toLowerCase() === scannedCustomer.toLowerCase())
      ? storedCustomerNames
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Closing mid-review throws the scan away. It used to do so in
          // silence, which looked identical to a scan that had been kept.
          if (stage === "review") {
            toast.warning(t("dcScan.discardedOnClose"));
          }
          reset();
          setCaptured(0);
        }
      }}
    >
      {/* Solid amber sits under the gradient in both variants: Tailwind v4
          gradients depend on @property, which older Safari lacks, and the
          button would otherwise render with no background at all. */}
      {compact ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              aria-label={t("dcScan.scanInward")}
              title={t("dcScan.scanInward")}
              className="size-11 shrink-0 border border-amber-500 bg-amber-400 bg-gradient-to-r from-amber-400 to-orange-500 p-0 text-[#10233f] shadow-sm hover:from-amber-500 hover:to-orange-600 md:size-9"
            />
          }
        >
          <ScanLine className="h-5 w-5" />
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <Button
              type="button"
              className="h-11 w-full gap-2 border border-amber-500 bg-amber-400 bg-gradient-to-r from-amber-400 to-orange-500 font-semibold text-[#10233f] shadow-sm hover:from-amber-500 hover:to-orange-600 sm:h-8 sm:w-auto sm:text-xs"
            />
          }
        >
          <ScanLine className="h-4 w-4" /> {t("dcScan.scanInward")}
        </DialogTrigger>
      )}

      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("dcScan.scanInward")}</DialogTitle>
          <DialogDescription>{t("dcScan.dialogDescription")}</DialogDescription>
        </DialogHeader>

        {stage === "idle" && (
          <div
            className={cn(
              "space-y-4 rounded-lg border-2 border-dashed p-3 transition-colors",
              dragging ? "border-[#10233f] bg-[#10233f]/5" : "border-transparent"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              // Ignore drags moving between children of the drop zone.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            {/* The real file input covers each tile at opacity 0, so a tap
                lands on the input itself. Triggering a hidden input with a
                scripted .click() is blocked or silently dropped by several
                mobile browsers; native activation always works. */}
            {/* Which tiles apply is decided in CSS, not JavaScript. A JS check
                cannot run on the server, so the camera tile would be missing
                from the delivered HTML and only appear once React hydrated —
                on a phone where hydration is slow or blocked it never showed
                up at all. `pointer-coarse` is the same test, evaluated by the
                browser before any script runs. */}
            <div className="grid gap-2 sm:pointer-coarse:grid-cols-2">
              <label
                className={cn(
                  TILE,
                  "bg-[#10233f] text-white hover:bg-[#10233f]/90 pointer-fine:hidden"
                )}
              >
                <Camera className="h-5 w-5" />
                {t("dcScan.takePhoto")}
                {/* No `capture` attribute on purpose. It makes the browser use
                    a quick in-app camera intent, and on Android that hands back
                    a heavily downscaled picture — a photographed challan came
                    through at 73kB, far too coarse for OCR to read a part
                    number. Without it the phone offers its own camera app,
                    which saves at full resolution. */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              <label
                className={cn(
                  TILE,
                  "border border-input bg-background hover:bg-accent",
                  // With no camera tile alongside it, this becomes the primary
                  // action and takes the primary styling.
                  "pointer-fine:border-0 pointer-fine:bg-[#10233f] pointer-fine:text-white pointer-fine:hover:bg-[#10233f]/90"
                )}
              >
                <ImageUp className="h-5 w-5" />
                {t("dcScan.uploadImage")}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
            </div>
            {captured > 0 && (
              <p className="rounded-md border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                {captured === 1
                  ? t("dcScan.capturedOne")
                  : t("dcScan.captured", { count: captured })}
              </p>
            )}

            {/* The queue now outlives the tab, so it has to be visible and
                clearable from here. Otherwise a scan taken days ago and never
                used would quietly fill the next challan. */}
            {waiting > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {waiting === 1
                      ? t("dcScan.waitingOne")
                      : t("dcScan.waiting", { count: waiting })}
                  </span>{" "}
                  {t("dcScan.waitingNote")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() => {
                    void discardPendingScans().then((result) => {
                      window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
                      toast.success(
                        result.removed === 1
                          ? t("dcScan.discardedCountOne")
                          : t("dcScan.discardedCount", { count: result.removed })
                      );
                    });
                  }}
                >
                  {t("dcScan.discardThem")}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("dcScan.captureTips")}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {stage === "working" && (
          <div className="space-y-3 py-6">
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {!progress || progress.stage === "improving"
                ? t("dcScan.progressImproving")
                : progress.stage === "matching"
                  ? t("dcScan.progressMatching")
                  : t("dcScan.progressReading", {
                      pass: progress.pass ?? 1,
                      passes: progress.passes ?? 1,
                    })}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#10233f] transition-all duration-700"
                style={{ width: `${Math.round(progressShare(progress) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("dcScan.firstScanNote")}</p>
          </div>
        )}

        {stage === "review" && scan && (
          // min-w-0: this is a grid item, and the one-line raw text under each
          // item otherwise set its width, cutting the review off on a phone.
          <div className="min-w-0 space-y-5">
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element -- transient
                 canvas data: URL, never a stored asset */
              <img
                src={previewUrl}
                alt={t("dcScan.scannedChallanAlt")}
                className="max-h-40 w-full rounded-md border object-contain"
              />
            )}

            {quality?.tooSmall && (
              <div className="space-y-1 rounded-md border border-destructive bg-destructive/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t("dcScan.tooSmallTitle")}
                </h3>
                <p className="text-xs text-destructive/90">
                  {t("dcScan.tooSmallBody", { px: quality.longEdge, min: MIN_READABLE_PX })}
                </p>
                <p className="text-xs text-destructive/80">{t("dcScan.tooSmallTip")}</p>
              </div>
            )}

            {nothingFound && (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("dcScan.nothingFound")}
              </p>
            )}

            {/* A poor photo is best fixed now, with the paper still in front
                of the operator. Nothing else on this screen is lost. */}
            <div
              className={cn(
                "space-y-2 rounded-md border p-3",
                (poorQuality || quality?.blurred) &&
                  "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
              )}
            >
              {(poorQuality || quality?.blurred) && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    {t("dcScan.poorQualityTitle")}
                  </h3>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {quality?.blurred ? t("dcScan.blurredBody") : t("dcScan.poorQualityBody")}
                  </p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:h-9">
                  <Camera className="h-4 w-4" /> {t("dcScan.retakePhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:h-9">
                  <ImageUp className="h-4 w-4" /> {t("dcScan.uploadBetter")}
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-9"
                  onClick={() => void handleFile(originalFile.current ?? undefined, true)}
                >
                  <RefreshCw className="h-4 w-4" /> {t("dcScan.tryOcrAgain")}
                </Button>
              </div>
            </div>

            {refMatches && (
              <div className="overflow-hidden rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <div className="border-b border-amber-500/40 px-3 py-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    {t("dcScan.mayBeRecordedTitle")}
                  </h3>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {t(
                      refMatches.matches.length === 1
                        ? "dcScan.matchCountOne"
                        : "dcScan.matchCount",
                      {
                        count: refMatches.matches.length,
                        basis: t(
                          refMatches.basis === "both"
                            ? "dcScan.basisBoth"
                            : refMatches.basis === "number"
                              ? "dcScan.basisNumber"
                              : "dcScan.basisDate"
                        ),
                      }
                    )}{" "}
                    {t("dcScan.checkBeforeApplying")}
                  </p>
                </div>
                <StoredDcMatchList matches={refMatches.matches} />
              </div>
            )}

            {correctedFrom && (
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {t("dcScan.correctedNote", { from: correctedFrom, to: scan.customerDcNumber })}
              </p>
            )}

            {customerMismatch && (
              <div className="rounded-md border border-destructive bg-destructive/5 px-3 py-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t("dcScan.differentCustomer")}
                </h3>
                <p className="text-xs text-destructive/90">
                  {t("dcScan.differentCustomerBody", {
                    scanned: scan.customerName,
                    stored: customerMismatch.join(", "),
                  })}
                </p>
              </div>
            )}

            {detectedFields.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("dcScan.detectedDetails")}</h3>
                {/* Every field is listed even when it was not read. Dropping the
                    row made a failed read look identical to a challan that
                    simply had no such value, so the gap went unnoticed. */}
                {detectedFields.map((field) => {
                  const current = values[field.key];
                  // Read confidently and not changed since: accepted as read.
                  const accepted =
                    Boolean(field.value) &&
                    fieldConfidence[field.key] === "high" &&
                    current ===
                      (field.key === "customerId" ? (scan.customerId ?? "") : field.value);
                  const fieldInputId = `${inputId}-${field.key}`;
                  return (
                    <div
                      key={field.key}
                      className={cn(
                        "space-y-1.5 rounded-md border p-2 text-sm",
                        !current && "border-dashed bg-muted/30",
                        current && !accepted && "border-amber-500"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={fieldInputId} className="text-muted-foreground">
                          {field.label}
                        </Label>
                        {current && !accepted ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            {t("dcScan.verifyField")}
                          </span>
                        ) : accepted ? (
                          <span className="text-xs text-emerald-700 dark:text-emerald-400">
                            {t("dcScan.readClearly")}
                          </span>
                        ) : null}
                      </div>
                      {field.key === "customerId" ? (
                        <SearchableSelect
                          options={customers.map((c) => c.name)}
                          value={customers.find((c) => c.id === current)?.name ?? null}
                          onChange={(name) =>
                            setValues((v) => ({
                              ...v,
                              customerId: customers.find((c) => c.name === name)?.id ?? "",
                            }))
                          }
                          placeholder={field.missingHint}
                          ariaLabel={field.label}
                          allowClear
                        />
                      ) : (
                        <Input
                          id={fieldInputId}
                          type={field.key === "customerDcDate" ? "date" : "text"}
                          value={current}
                          placeholder={field.missingHint}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.key]: e.target.value }))
                          }
                          className="h-11 sm:h-9"
                        />
                      )}
                      {field.value &&
                        current !==
                          (field.key === "customerId" ? (scan.customerId ?? "") : field.value) && (
                          <p className="text-xs text-muted-foreground">
                            {t("dcScan.readAs", {
                              value:
                                field.key === "customerDcDate"
                                  ? formatDcDate(field.value, lang)
                                  : field.value,
                            })}
                          </p>
                        )}
                    </div>
                  );
                })}
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  {t("dcScan.detectedItems")}{" "}
                  <span className="text-muted-foreground">{t("dcScan.receivedQtyParen")}</span>
                </h3>
                {items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 rounded-md border p-2 sm:gap-3"
                  >
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0 accent-[#10233f] sm:h-4 sm:w-4"
                      checked={item.include}
                      onChange={(e) =>
                        setItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key ? { ...row, include: e.target.checked } : row
                          )
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      {/* Chosen from Settings only. A row OCR could not match,
                          or matched with low confidence, is set here by hand. */}
                      <SearchableSelect
                        options={components}
                        value={item.component || null}
                        onChange={(value) =>
                          setItems((rows) =>
                            rows.map((row) =>
                              row.key === item.key
                                ? { ...row, component: value ?? "", confidence: 1, verify: false }
                                : row
                            )
                          )
                        }
                        placeholder={t("dcScan.chooseFromSettings")}
                        searchPlaceholder={t("dcForm.searchComponents")}
                        emptyText={t("dcForm.noComponentMatch")}
                        invalid={item.include && !item.component}
                        ariaLabel={t("common.component")}
                      />
                      <p className="mt-1 text-xs">
                        {item.material && (
                          <span className="text-muted-foreground">{item.material} · </span>
                        )}
                        {!item.component ? (
                          <span className="text-destructive">{t("dcScan.notMatched")}</span>
                        ) : item.verify || item.confidence < LOW_CONFIDENCE ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            {t("dcScan.verifyField")}
                          </span>
                        ) : item.confidence < 1 ? (
                          <span className="text-muted-foreground">
                            {t("dcScan.match", { pct: Math.round(item.confidence * 100) })}
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {t("dcScan.readClearly")}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{item.rawLine}</p>
                    </div>
                    <div className="w-14 shrink-0 [&_input]:h-11 [&_input]:px-1 [&_input]:text-center sm:w-20 sm:[&_input]:h-8 sm:[&_input]:px-3 sm:[&_input]:text-left">
                      <Label className="sr-only" htmlFor={`${inputId}-qty-${item.key}`}>
                        {t("dcScan.receivedQtyFor", { component: item.component })}
                      </Label>
                      <Input
                        id={`${inputId}-qty-${item.key}`}
                        type="number"
                        min="0"
                        step="any"
                        value={item.received_qty}
                        onChange={(e) =>
                          setItems((rows) =>
                            rows.map((row) =>
                              row.key === item.key
                                ? { ...row, received_qty: Number(e.target.value) }
                                : row
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unreadableLines.length > 0 && (
              <div className="space-y-1 rounded-md border border-dashed p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {unreadableLines.length === 1
                    ? t("dcScan.unreadableOne")
                    : t("dcScan.unreadable", { count: unreadableLines.length })}
                </h3>
                <p className="text-xs text-muted-foreground">{t("dcScan.unreadableNote")}</p>
                <ul className="space-y-1">
                  {unreadableLines.map((line, i) => (
                    <li key={i} className="truncate font-mono text-xs text-muted-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="rounded-md border p-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("dcScan.rawText")}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {rawText || t("dcScan.empty")}
              </pre>
            </details>
          </div>
        )}

        <DialogFooter>
          {stage === "review" && (
            <>
              <p className="mr-auto self-center text-xs text-muted-foreground">
                {t("dcScan.keepOrLose")}
              </p>
              <Button type="button" variant="outline" onClick={reset}>
                {t("dcScan.discardThisScan")}
              </Button>
              {/* Named for what it does to THIS challan, not for what might
                  come next: labelled "Capture & scan next" it read as an
                  invitation to scan another, so anyone with a single challan
                  closed the dialog instead and lost the scan. */}
              <Button
                type="button"
                className="bg-[#10233f] hover:bg-[#10233f]/90"
                onClick={() => void apply()}
                // Nothing read can still be kept once the operator has typed it in.
                disabled={
                  storing || (nothingFound && !values.customerDcNumber.trim() && items.length === 0)
                }
              >
                {storing ? t("dcScan.uploading") : t("dcScan.keepThisChallan")}
              </Button>
            </>
          )}
          {stage === "idle" && captured > 0 && (
            <Button
              type="button"
              className="bg-[#10233f] hover:bg-[#10233f]/90"
              onClick={() => setOpen(false)}
            >
              {t("dcScan.doneCaptured", { count: captured })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

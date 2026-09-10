"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Camera, ImageUp, Loader2, PackagePlus, ScanLine } from "lucide-react";
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
import {
  prepareImage,
  recognizeText,
  type ImageQuality,
  type OcrProgress,
} from "@/lib/ocr/recognize";
import {
  parseInwardDc,
  type ScannedInwardDc,
  type ScannedNewComponent,
} from "@/lib/ocr/parse-inward-dc";
import { addScannedComponentNamesAction } from "@/lib/actions/dc-picklists";
import { countPendingScans, PENDING_SCAN_CHANGED, takePendingScans } from "@/lib/dc-scan-handoff";
import {
  correctScannedCustomerDcNumber,
  findDcsByCustomerRef,
  type StoredDcMatch,
} from "@/lib/actions/dc-lookup";
import { formatDcDate, StoredDcMatchList } from "@/components/dc-ref-lookup";
import type { ComboboxCustomer } from "@/components/customer-combobox";

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

type Stage = "idle" | "working" | "review";

type ReviewItem = ScannedItemSelection & {
  key: number;
  include: boolean;
  confidence: number;
  rawLine: string;
};

/** Which single-value fields the operator has ticked to apply. */
type FieldKey = "customerId" | "customerDcNumber" | "customerDcDate";

/** A scanned description awaiting a decision before it joins the component list. */
type NewNameEntry = ScannedNewComponent & { key: number; include: boolean };

/** Shared look for the two capture tiles; each wraps its own file input. */
const TILE =
  "relative flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

/** Quoted in the warning, so the number the operator sees matches the check. */
const MIN_READABLE_PX = 1500;

function subscribeToQueue(onChange: () => void) {
  window.addEventListener(PENDING_SCAN_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PENDING_SCAN_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const PROGRESS_LABELS: Record<string, string> = {
  "loading tesseract core": "Loading the OCR engine",
  "initializing tesseract": "Starting the OCR engine",
  "loading language traineddata": "Loading the language data",
  "initializing api": "Getting ready",
  "recognizing text": "Reading the challan",
};

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
  onApply: (result: DcScanResult) => boolean | Promise<boolean>;
  /** The challan being edited, so it is not reported as its own duplicate. */
  excludeDcId?: string | null;
  /** Icon-only trigger, for the dashboard header bar. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** How good the photograph was, so a bad one can be called out. */
  const [quality, setQuality] = useState<ImageQuality | null>(null);
  const [rawText, setRawText] = useState("");
  const [scan, setScan] = useState<ScannedInwardDc | null>(null);
  const [fields, setFields] = useState<Record<FieldKey, boolean>>({
    customerId: true,
    customerDcNumber: true,
    customerDcDate: true,
  });
  const [items, setItems] = useState<ReviewItem[]>([]);
  /** Descriptions the component list does not hold yet, editable before storing. */
  const [newNames, setNewNames] = useState<NewNameEntry[]>([]);
  const [storing, setStoring] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Challans captured since this dialog was opened. */
  const [captured, setCaptured] = useState(0);
  const [correctedFrom, setCorrectedFrom] = useState<string | null>(null);
  const [refMatches, setRefMatches] = useState<{
    basis: "both" | "number" | "date";
    matches: StoredDcMatch[];
  } | null>(null);

  // Kept in step with the queue, which now outlives the tab, so the dialog can
  // say what is waiting and offer to clear it.
  const waiting = useSyncExternalStore(
    subscribeToQueue,
    () => countPendingScans(),
    () => 0
  );

  const router = useRouter();
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
    setNewNames([]);
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

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setStage("working");
    setError(null);
    setProgress(null);

    try {
      const { canvas, previewUrl: preview, quality: measured } = await prepareImage(file);
      setPreviewUrl(preview);
      setQuality(measured);

      const text = await recognizeText(canvas, setProgress);
      const parsed = parseInwardDc(text, { customers, components, materials });

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
      void lookupExisting(resolved.customerDcNumber, resolved.customerDcDate);
      setItems(
        parsed.items.map((item, index) => ({
          key: index,
          include: true,
          component: item.component,
          material: item.material,
          received_qty: item.received_qty,
          confidence: item.confidence,
          rawLine: item.rawLine,
        }))
      );
      setNewNames(
        parsed.newComponents.map((candidate, index) => ({
          ...candidate,
          key: index,
          include: true,
        }))
      );
      setStage("review");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not read that image. Try a flatter, better-lit photo."
      );
      setStage("idle");
    }
  }

  async function apply() {
    if (!scan) return;

    // Descriptions new to the component list are stored first, so the rows
    // built from them have something to select in the Description dropdown.
    const wanted = newNames
      .filter((entry) => entry.include && entry.name.trim())
      .map((entry) => ({ ...entry, name: entry.name.trim() }));

    let stored: string[] = [];
    if (wanted.length > 0) {
      setStoring(true);
      try {
        const result = await addScannedComponentNamesAction(wanted.map((entry) => entry.name));
        if (result.error) {
          toast.error(result.error);
          setStoring(false);
          return;
        }
        stored = result.added;
      } catch {
        toast.error("Could not save the new descriptions. Nothing was kept.");
        setStoring(false);
        return;
      }
      setStoring(false);
    }

    // Awaited, and the result checked: keeping a scan can fail, and reporting a
    // capture that never happened is exactly how scans were lost before.
    const kept = await onApply({
      customerId: fields.customerId ? scan.customerId : null,
      customerDcNumber: fields.customerDcNumber ? scan.customerDcNumber : null,
      customerDcDate: fields.customerDcDate ? scan.customerDcDate : null,
      items: [
        ...items
          .filter((item) => item.include)
          .map(({ component, material, received_qty }) => ({ component, material, received_qty })),
        ...wanted.map(({ name, material, received_qty }) => ({
          component: name,
          material,
          received_qty,
        })),
      ],
    });
    // The review stays on screen so the scan can be kept again once whatever
    // refused it is dealt with.
    if (!kept) return;

    if (stored.length > 0) {
      toast.success(
        `${stored.length} description${stored.length === 1 ? "" : "s"} added to the component list.`
      );
      // The picklists are server data; without this the Description dropdown
      // would not offer what was just stored until a reload.
      router.refresh();
    }

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
          label: "Customer",
          value: scan.customerName,
          missingHint: "No customer on file matched this challan — pick one on the form.",
        },
        {
          key: "customerDcNumber",
          label: "Customer DC No.",
          value: scan.customerDcNumber,
          missingHint: "Not read — type it from the paper challan.",
        },
        {
          key: "customerDcDate",
          label: "Customer DC date",
          value: scan.customerDcDate,
          missingHint: "Not read — set it on the form.",
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
            toast.warning("That scan was discarded. Nothing was kept for the delivery challan.");
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
              aria-label="Scan inward challan"
              title="Scan inward challan"
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
          <ScanLine className="h-4 w-4" /> Scan inward challan
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan inward challan</DialogTitle>
          <DialogDescription>
            Photograph or upload the customer&apos;s delivery challan. Text is read on this device —
            the image is never uploaded or stored. Check every value before applying.
          </DialogDescription>
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
                Take photo
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
                Upload image
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
                {captured} challan{captured === 1 ? "" : "s"} captured. Scan another, or close this
                — they will fill the new delivery challan together.
              </p>
            )}

            {/* The queue now outlives the tab, so it has to be visible and
                clearable from here. Otherwise a scan taken days ago and never
                used would quietly fill the next challan. */}
            {waiting > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {waiting} scanned challan{waiting === 1 ? "" : "s"} waiting
                  </span>{" "}
                  to fill the next new delivery challan. They are kept until one is saved.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() => {
                    const dropped = takePendingScans().length;
                    toast.success(`Discarded ${dropped} waiting scan${dropped === 1 ? "" : "s"}.`);
                  }}
                >
                  Discard them
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Lay the challan flat, fill the frame, and avoid shadows and glare. Only components and
              materials already in Settings can be matched.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {stage === "working" && (
          <div className="space-y-3 py-6">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {PROGRESS_LABELS[progress?.status ?? ""] ?? "Preparing the image"}…
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#10233f] transition-all"
                style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The first scan on a device downloads the OCR engine, so it takes longer than later
              ones.
            </p>
          </div>
        )}

        {stage === "review" && scan && (
          <div className="space-y-5">
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element -- transient
                 canvas data: URL, never a stored asset */
              <img
                src={previewUrl}
                alt="Scanned challan"
                className="max-h-40 w-full rounded-md border object-contain"
              />
            )}

            {quality?.tooSmall && (
              <div className="space-y-1 rounded-md border border-destructive bg-destructive/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  This photo is too small to read reliably
                </h3>
                <p className="text-xs text-destructive/90">
                  {quality.longEdge}px across, where a part number needs about {MIN_READABLE_PX}px.
                  Everything below is a guess — check every value, or retake the photo now while the
                  challan is in front of you.
                </p>
                <p className="text-xs text-destructive/80">
                  Hold the phone square over the sheet and fill the frame with it. If your camera
                  offers a choice, take the picture with the camera app rather than a quick capture.
                </p>
              </div>
            )}

            {nothingFound && (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Nothing recognisable was found. Try a sharper, flatter photo — or close this and key
                the challan in by hand.
              </p>
            )}

            {refMatches && (
              <div className="overflow-hidden rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <div className="border-b border-amber-500/40 px-3 py-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    This challan may already be recorded
                  </h3>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {refMatches.matches.length} stored delivery challan
                    {refMatches.matches.length === 1 ? "" : "s"} match
                    {refMatches.matches.length === 1 ? "es" : ""}{" "}
                    {refMatches.basis === "both"
                      ? "this DC number and date"
                      : refMatches.basis === "number"
                        ? "this DC number"
                        : "this date (the scanned DC number did not match)"}
                    . Check before applying so the same inward challan is not entered twice.
                  </p>
                </div>
                <StoredDcMatchList matches={refMatches.matches} />
              </div>
            )}

            {correctedFrom && (
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Read as <span className="font-mono">{correctedFrom}</span> — corrected to{" "}
                <span className="font-mono font-medium">{scan.customerDcNumber}</span> to match the
                reference already on file. Untick it below to keep the scan as read.
              </p>
            )}

            {customerMismatch && (
              <div className="rounded-md border border-destructive bg-destructive/5 px-3 py-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Different customer
                </h3>
                <p className="text-xs text-destructive/90">
                  This challan reads as <span className="font-medium">{scan.customerName}</span>,
                  but the reference is already on file under {customerMismatch.join(", ")}. Check
                  you are scanning the right paper before applying.
                </p>
              </div>
            )}

            {detectedFields.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Detected details</h3>
                {/* Every field is listed even when it was not read. Dropping the
                    row made a failed read look identical to a challan that
                    simply had no such value, so the gap went unnoticed. */}
                {detectedFields.map((field) => (
                  <label
                    key={field.key}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-2 text-sm",
                      !field.value && "border-dashed bg-muted/30"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#10233f]"
                      checked={Boolean(field.value) && fields[field.key]}
                      disabled={!field.value}
                      onChange={(e) => setFields((f) => ({ ...f, [field.key]: e.target.checked }))}
                    />
                    <span className="w-36 shrink-0 text-muted-foreground">{field.label}</span>
                    {field.value ? (
                      <span className="font-medium">
                        {field.key === "customerDcDate" ? formatDcDate(field.value) : field.value}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">{field.missingHint}</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Detected items <span className="text-muted-foreground">(received qty)</span>
                </h3>
                {items.map((item) => (
                  <div key={item.key} className="flex items-center gap-3 rounded-md border p-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#10233f]"
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
                      <p className="truncate text-sm font-medium">
                        {item.component}
                        {item.material && (
                          <span className="text-muted-foreground"> · {item.material}</span>
                        )}
                        {item.confidence < 1 && (
                          <span className="ml-2 text-xs text-amber-600">
                            {Math.round(item.confidence * 100)}% match
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{item.rawLine}</p>
                    </div>
                    <div className="w-20 shrink-0">
                      <Label className="sr-only" htmlFor={`${inputId}-qty-${item.key}`}>
                        Received quantity for {item.component}
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

            {newNames.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/20">
                <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                  <PackagePlus className="h-4 w-4" />
                  {newNames.length} new description{newNames.length === 1 ? "" : "s"}
                </h3>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Not in your component list yet. Ticked ones are added to it when you keep this
                  challan, so there is no need to type them into Settings. Correct any misreading
                  first — the name is stored exactly as it appears here.
                </p>
                {newNames.map((entry) => (
                  <div key={entry.key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-2.5 h-4 w-4 shrink-0 accent-[#10233f]"
                      checked={entry.include}
                      onChange={(e) =>
                        setNewNames((rows) =>
                          rows.map((row) =>
                            row.key === entry.key ? { ...row, include: e.target.checked } : row
                          )
                        )
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Input
                        value={entry.name}
                        aria-label="New component description"
                        onChange={(e) =>
                          setNewNames((rows) =>
                            rows.map((row) =>
                              row.key === entry.key ? { ...row, name: e.target.value } : row
                            )
                          )
                        }
                        className="h-9 bg-background text-sm"
                      />
                      <p className="truncate font-mono text-[11px] text-amber-900/70 dark:text-amber-200/70">
                        read: {entry.rawLine} → qty {entry.received_qty}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unreadableLines.length > 0 && (
              <div className="space-y-1 rounded-md border border-dashed p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {unreadableLines.length} row{unreadableLines.length === 1 ? "" : "s"} could not be
                  read
                </h3>
                <p className="text-xs text-muted-foreground">
                  These carry a quantity but no description could be made out. Enter them by hand.
                </p>
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
                Raw scanned text
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {rawText || "(empty)"}
              </pre>
            </details>
          </div>
        )}

        <DialogFooter>
          {stage === "review" && (
            <>
              <p className="mr-auto self-center text-xs text-muted-foreground">
                Keep it, or it is lost when you close this.
              </p>
              <Button type="button" variant="outline" onClick={reset}>
                Discard this scan
              </Button>
              {/* Named for what it does to THIS challan, not for what might
                  come next: labelled "Capture & scan next" it read as an
                  invitation to scan another, so anyone with a single challan
                  closed the dialog instead and lost the scan. */}
              <Button
                type="button"
                className="bg-[#10233f] hover:bg-[#10233f]/90"
                onClick={() => void apply()}
                disabled={nothingFound || storing}
              >
                {storing ? "Saving…" : "Keep this challan"}
              </Button>
            </>
          )}
          {stage === "idle" && captured > 0 && (
            <Button
              type="button"
              className="bg-[#10233f] hover:bg-[#10233f]/90"
              onClick={() => setOpen(false)}
            >
              Done — {captured} captured
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

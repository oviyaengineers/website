"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Settings2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeightStatusBadge } from "@/components/weight-status-badge";
import { saveWeightsAction, type WeightLineInput } from "@/lib/actions/weight";
import { formatDate } from "@/lib/i18n/dates";
import type { WeightLine } from "@/lib/weight-lines";
import {
  formatRupeesFromPaise,
  formatWeight,
  formatWeightIn,
  NOT_CONFIGURED_TEXT,
  RATE_PROBLEM_TEXT,
  rateText,
  scrapFigures,
  SENT_CHANGED_TEXT,
  toPaisePerKg,
  validateRate,
  type RateProblem,
} from "@/lib/weight";

type Draft = { rateText: string; accept: boolean; remove: boolean };

function initialDraft(line: WeightLine): Draft {
  return {
    rateText: line.recorded ? rateText(line.recorded.ratePaisePerKg / 100) : "",
    accept: false,
    remove: false,
  };
}

/** What saving this line would do, or null when nothing changed. */
function changeFor(line: WeightLine, draft: Draft): WeightLineInput | null {
  if (line.recorded) {
    if (draft.remove) return { dcItemId: line.itemId, kind: "remove" };
    if (draft.accept) return { dcItemId: line.itemId, kind: "acceptSentQty" };
    if (
      toPaisePerKg(draft.rateText) === line.recorded.ratePaisePerKg &&
      validateRate(draft.rateText) === null
    ) {
      return null;
    }
    return { dcItemId: line.itemId, kind: "rate", rateText: draft.rateText };
  }
  if (line.master && draft.rateText.trim() !== "") {
    return { dcItemId: line.itemId, kind: "rate", rateText: draft.rateText };
  }
  return null;
}

const qty = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Weight / Scrap for every line of one DC.
 *
 * Weights are never typed here: a line not yet recorded shows the active
 * master for its Component + Material, and recording copies those weights. A
 * recorded line shows exactly what was recorded. The admin enters only the
 * scrap rate, accepts a changed Sent Qty, or removes a record. Changed lines
 * are saved together in one database transaction, and the database checks
 * every rule again.
 */
export function WeightEditor({
  dcId,
  lines,
  canEdit,
}: {
  dcId: string;
  lines: WeightLine[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = useMemo(
    () => new Map(lines.map((line) => [line.itemId, initialDraft(line)])),
    [lines]
  );
  const [drafts, setDrafts] = useState<Map<string, Draft>>(() => new Map(initial));
  const [attempted, setAttempted] = useState(false);

  function update(itemId: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const next = new Map(current);
      next.set(itemId, { ...next.get(itemId)!, ...patch });
      return next;
    });
  }

  const changes = lines
    .map((line) => ({ line, change: changeFor(line, drafts.get(line.itemId)!) }))
    .filter(
      (entry): entry is { line: WeightLine; change: WeightLineInput } => entry.change !== null
    );
  const problemFor = (line: WeightLine): RateProblem | null => {
    const change = changeFor(line, drafts.get(line.itemId)!);
    return change?.kind === "rate" ? validateRate(change.rateText) : null;
  };
  const invalid = changes.filter(({ line }) => problemFor(line) !== null);

  function save() {
    setAttempted(true);
    if (changes.length === 0) {
      toast.info("Nothing to save.");
      return;
    }
    if (invalid.length > 0) {
      toast.error("Fix the highlighted scrap rates first.");
      return;
    }
    startTransition(async () => {
      const result = await saveWeightsAction(
        dcId,
        changes.map(({ change }) => change)
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.removed > 0
          ? `Saved. ${result.removed === 1 ? "1 record" : `${result.removed} records`} removed.`
          : "Weight / Scrap saved."
      );
      setAttempted(false);
      router.refresh();
    });
  }

  return (
    <div className={`space-y-4 ${canEdit ? "pb-24" : ""}`}>
      {lines.map((line, index) => {
        const draft = drafts.get(line.itemId)!;
        const change = changeFor(line, draft);
        const problem = problemFor(line);
        const showProblem = problem !== null && (attempted || draft.rateText.trim() !== "");
        return (
          <section
            key={line.itemId}
            className={`space-y-3 rounded-lg border p-3 sm:p-4 ${
              showProblem ? "border-destructive/60" : change ? "border-[#10233f]/40" : ""
            }`}
          >
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">#{index + 1}</p>
                <h3 className="font-medium break-words">{line.component}</h3>
                <p className="text-xs text-muted-foreground">Material: {line.material ?? "—"}</p>
              </div>
              <WeightStatusBadge status={line.status} />
            </header>

            {line.status === "notConfigured" ? (
              <NotConfigured line={line} canEdit={canEdit} />
            ) : (
              <LineBody
                line={line}
                draft={draft}
                canEdit={canEdit}
                problem={showProblem ? problem : null}
                onChange={(patch) => update(line.itemId, patch)}
              />
            )}

            {line.recorded?.recordedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved {formatDate(line.recorded.recordedAt, "dd MMM yyyy HH:mm", "en")}
              </p>
            )}
          </section>
        );
      })}

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {changes.length === 0
                ? "No unsaved changes."
                : changes.length === 1
                  ? "1 line changed."
                  : `${changes.length} lines changed.`}
            </p>
            <Button
              type="button"
              onClick={save}
              disabled={pending || changes.length === 0}
              className="h-11 bg-[#10233f] px-6 hover:bg-[#10233f]/90 sm:h-9"
            >
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotConfigured({ line, canEdit }: { line: WeightLine; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <SentQty value={line.sentQty} />
      <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {NOT_CONFIGURED_TEXT} No scrap is calculated until an active master exists for{" "}
          <strong>{line.component}</strong> + <strong>{line.material ?? "—"}</strong>.
        </span>
      </p>
      {canEdit && (
        <Button
          render={<Link href="/dashboard/settings/weight-master" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <Settings2 className="h-4 w-4" /> Open Weight/Scrap Master
        </Button>
      )}
    </div>
  );
}

function SentQty({ value, note }: { value: number; note?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Sent Qty (from DC)</p>
      <p className="flex h-11 items-center rounded-md border bg-muted px-3 font-semibold tabular-nums sm:h-9">
        {qty(value)}
      </p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function LineBody({
  line,
  draft,
  canEdit,
  problem,
  onChange,
}: {
  line: WeightLine;
  draft: Draft;
  canEdit: boolean;
  problem: RateProblem | null;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const r = line.recorded;
  const m = line.master;
  const unit = r?.unit ?? m?.unit ?? "kg";
  const roughMg = r?.roughMg ?? m?.roughMg ?? 0;
  const finishedMg = r?.finishedMg ?? m?.finishedMg ?? 0;
  const scrapMg = r?.scrapPerPieceMg ?? m?.scrapPerPieceMg ?? 0;
  const sentUsed = r ? (draft.accept ? line.sentQty : r.sentQty) : line.sentQty;

  const typedRate = validateRate(draft.rateText) === null ? toPaisePerKg(draft.rateText) : null;
  const rateUnchanged = r !== null && typedRate === r.ratePaisePerKg && !draft.accept;
  // Unchanged recorded lines show the stored figures exactly; anything else is a preview.
  const figures = rateUnchanged
    ? { totalScrapMg: r.totalScrapMg, totalValuePaise: r.valuePaise }
    : scrapFigures(roughMg, finishedMg, sentUsed, typedRate);

  if (r && draft.remove) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 p-3 text-sm">
        <span>
          This record will be removed when you save. It can be recorded again from the active
          master.
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-8"
          onClick={() => onChange({ remove: false })}
        >
          <Undo2 className="h-4 w-4" /> Keep record
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {line.status === "sentChanged" && r && (
        <div className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {SENT_CHANGED_TEXT} Recorded with {qty(r.sentQty)}; the DC now says{" "}
              {qty(line.sentQty)}. The recorded totals still use {qty(r.sentQty)}.
            </span>
          </p>
          {canEdit && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.accept}
                onChange={(e) =>
                  onChange({ accept: e.target.checked, rateText: rateText(r.ratePaisePerKg / 100) })
                }
              />
              Use the current Sent Qty ({qty(line.sentQty)}) for this record, keeping its recorded
              weights
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SentQty
          value={line.sentQty}
          note={
            r && !draft.accept && line.status === "sentChanged"
              ? `Totals use ${qty(r.sentQty)}`
              : undefined
          }
        />
        <Readout label="Rough / pc" value={formatWeightIn(roughMg, unit)} />
        <Readout label="Finished / pc" value={formatWeightIn(finishedMg, unit)} />
        <Readout label="Scrap / pc" value={formatWeightIn(scrapMg, unit)} strong />
      </div>
      <p className="text-xs text-muted-foreground">
        {r
          ? "Recorded weights. They never change, even if the Weight/Scrap Master is edited later."
          : "From the active Weight/Scrap Master. Saving with a scrap rate records these weights for this line."}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canEdit ? (
          <label className="col-span-2 space-y-1 sm:col-span-1">
            <span className="block text-xs text-muted-foreground">Scrap rate (₹/kg)</span>
            <Input
              inputMode="decimal"
              value={draft.rateText}
              disabled={draft.accept}
              aria-invalid={problem !== null || undefined}
              placeholder={r ? "" : "Enter to record"}
              onChange={(e) => onChange({ rateText: e.target.value })}
              className="h-11 tabular-nums sm:h-9"
            />
          </label>
        ) : (
          <Readout
            label="Scrap rate"
            value={r ? `${formatRupeesFromPaise(r.ratePaisePerKg)} / kg` : "—"}
          />
        )}
        <Readout label="Total scrap" value={formatWeight(figures.totalScrapMg)} strong />
        <Readout
          label="Scrap value"
          value={
            figures.totalValuePaise === null ? "—" : formatRupeesFromPaise(figures.totalValuePaise)
          }
          strong
        />
      </div>
      {problem && <p className="text-sm text-destructive">{RATE_PROBLEM_TEXT[problem]}</p>}

      {canEdit && r && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-destructive hover:text-destructive sm:h-8"
          onClick={() => onChange({ remove: true, accept: false })}
        >
          <Trash2 className="h-4 w-4" /> Remove record
        </Button>
      )}
    </div>
  );
}

function Readout({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`flex h-11 items-center rounded-md border border-dashed px-3 tabular-nums sm:h-9 ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

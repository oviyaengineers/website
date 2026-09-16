"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Undo2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { WeightStatusBadge } from "@/components/weight-status-badge";
import { saveWeightsAction, type WeightLineInput } from "@/lib/actions/weight";
import { formatDate } from "@/lib/i18n/dates";
import type { WeightLine } from "@/lib/weight-lines";
import {
  calculateScrap,
  formatRupeesFromPaise,
  formatWeight,
  formatWeightIn,
  gramsToMilligrams,
  isWeightUnit,
  milligramsInUnit,
  rateText,
  storedScrapFigures,
  validateWeightEntry,
  type WeightEntry,
  type WeightProblem,
  type WeightUnit,
} from "@/lib/weight";

type Draft = WeightEntry & { remove: boolean };

function initialDraft(line: WeightLine): Draft {
  const w = line.weight;
  if (!w) {
    return {
      roughText: "",
      roughUnit: "kg",
      finishedText: "",
      finishedUnit: "kg",
      rateText: "",
      remove: false,
    };
  }
  const roughUnit: WeightUnit = isWeightUnit(w.rough_unit) ? w.rough_unit : "g";
  const finishedUnit: WeightUnit = isWeightUnit(w.finished_unit) ? w.finished_unit : "g";
  return {
    roughText: milligramsInUnit(gramsToMilligrams(w.rough_weight_g), roughUnit),
    roughUnit,
    finishedText: milligramsInUnit(gramsToMilligrams(w.finished_weight_g), finishedUnit),
    finishedUnit,
    rateText: rateText(w.scrap_rate_per_kg),
    remove: false,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.remove === b.remove &&
    a.roughText.trim() === b.roughText.trim() &&
    a.finishedText.trim() === b.finishedText.trim() &&
    a.rateText.trim() === b.rateText.trim() &&
    // A unit change with nothing typed changes nothing worth saving.
    (a.roughText.trim() === "" || a.roughUnit === b.roughUnit) &&
    (a.finishedText.trim() === "" || a.finishedUnit === b.finishedUnit)
  );
}

function isBlank(d: Draft): boolean {
  return !d.roughText.trim() && !d.finishedText.trim() && !d.rateText.trim();
}

const qty = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Weight entry for every line of one DC.
 *
 * Nothing here can change a quantity: Sent Qty is shown from the DC and is
 * never sent back. Only lines that changed are saved, together, in one
 * database transaction, and the database checks every rule again.
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
  const { t, lang } = useI18n();
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

  const changed = lines.filter((line) => {
    const draft = drafts.get(line.itemId)!;
    const start = initial.get(line.itemId)!;
    if (sameDraft(draft, start)) return false;
    // Typing then clearing a line that had no weight leaves nothing to save.
    return !(line.weight === null && isBlank(draft) && !draft.remove);
  });

  const problemsFor = (line: WeightLine): WeightProblem[] => {
    const draft = drafts.get(line.itemId)!;
    if (draft.remove) return [];
    if (line.weight === null && isBlank(draft)) return [];
    return validateWeightEntry(draft);
  };
  const invalid = changed.filter((line) => problemsFor(line).length > 0);

  function save() {
    setAttempted(true);
    if (changed.length === 0) {
      toast.info(t("weight.nothingToSave"));
      return;
    }
    if (invalid.length > 0) {
      toast.error(t("weight.fixLines"));
      return;
    }
    const payload: WeightLineInput[] = changed.map((line) => {
      const d = drafts.get(line.itemId)!;
      return d.remove
        ? { dcItemId: line.itemId, remove: true }
        : {
            dcItemId: line.itemId,
            roughText: d.roughText,
            roughUnit: d.roughUnit,
            finishedText: d.finishedText,
            finishedUnit: d.finishedUnit,
            rateText: d.rateText,
          };
    });
    startTransition(async () => {
      const result = await saveWeightsAction(dcId, payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.removed > 0
          ? t("weight.savedAndRemoved", { removed: result.removed })
          : t("weight.saved")
      );
      setAttempted(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {lines.map((line, index) => {
        const draft = drafts.get(line.itemId)!;
        const isChanged = changed.includes(line);
        const problems = problemsFor(line);
        const showProblems = problems.length > 0 && (attempted || (isChanged && !isBlank(draft)));
        return (
          <section
            key={line.itemId}
            className={`space-y-3 rounded-lg border p-3 sm:p-4 ${
              showProblems ? "border-destructive/60" : isChanged ? "border-[#10233f]/40" : ""
            }`}
          >
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">#{index + 1}</p>
                <h3 className="font-medium break-words">{line.component}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("common.material")}: {line.material ?? "—"}
                  {line.followUpOf ? ` · ${t("weight.followUpOf", { dc: line.followUpOf })}` : ""}
                </p>
              </div>
              <WeightStatusBadge status={line.status} />
            </header>

            {line.status === "sentChanged" && line.weight && (
              <p className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t("weight.sentChangedNote", {
                  saved: qty(Number(line.weight.sent_qty_at_save)),
                  now: qty(line.sentQty),
                })}
              </p>
            )}

            {canEdit ? (
              <EditableLine
                line={line}
                draft={draft}
                problems={showProblems ? problems : []}
                onChange={(patch) => update(line.itemId, patch)}
              />
            ) : (
              <ReadOnlyLine line={line} />
            )}

            {line.weight && (
              <p className="text-xs text-muted-foreground">
                {t("weight.lastSaved", {
                  date: formatDate(line.weight.updated_at, "dd MMM yyyy HH:mm", lang),
                })}
              </p>
            )}
          </section>
        );
      })}

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {changed.length === 0
                ? t("weight.nothingToSave")
                : changed.length === 1
                  ? t("weight.unsavedChangesOne")
                  : t("weight.unsavedChanges", { count: changed.length })}
            </p>
            <Button
              type="button"
              onClick={save}
              disabled={pending || changed.length === 0}
              className="h-11 bg-[#10233f] px-6 hover:bg-[#10233f]/90 sm:h-9"
            >
              {pending ? t("weight.saving") : t("weight.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableLine({
  line,
  draft,
  problems,
  onChange,
}: {
  line: WeightLine;
  draft: Draft;
  problems: WeightProblem[];
  onChange: (patch: Partial<Draft>) => void;
}) {
  const { t } = useI18n();
  const result = calculateScrap(draft, line.sentQty);
  const figures = result.ok ? result.figures : null;
  const dash = t("weight.notEntered");

  if (draft.remove) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 p-3 text-sm">
        <span>{t("weight.willRemove")}</span>
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-8"
          onClick={() => onChange({ ...initialDraft(line), remove: false })}
        >
          <Undo2 className="h-4 w-4" /> {t("weight.keepWeight")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("weight.sentFromDc")}</p>
          <p className="flex h-11 items-center rounded-md border bg-muted px-3 font-semibold tabular-nums sm:h-9">
            {qty(line.sentQty)}
          </p>
        </div>
        <WeightInput
          label={`${t("weight.rough")} ${t("weight.perPiece")}`}
          text={draft.roughText}
          unit={draft.roughUnit}
          invalid={problems.some(
            (p) => p === "roughMissing" || p === "roughInvalid" || p === "finishedOverRough"
          )}
          onText={(roughText) => onChange({ roughText })}
          onUnit={(roughUnit) => onChange({ roughUnit })}
        />
        <WeightInput
          label={`${t("weight.finished")} ${t("weight.perPiece")}`}
          text={draft.finishedText}
          unit={draft.finishedUnit}
          invalid={problems.some(
            (p) => p === "finishedMissing" || p === "finishedInvalid" || p === "finishedOverRough"
          )}
          onText={(finishedText) => onChange({ finishedText })}
          onUnit={(finishedUnit) => onChange({ finishedUnit })}
        />
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">
            {t("weight.scrapRate")} ({t("weight.rupeesPerKg")})
          </span>
          <Input
            inputMode="decimal"
            value={draft.rateText}
            aria-invalid={problems.includes("rateInvalid") || undefined}
            placeholder={t("weight.notEntered")}
            onChange={(e) => onChange({ rateText: e.target.value })}
            className="h-11 tabular-nums sm:h-9"
          />
        </label>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-0.5 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem}>{t(`weight.problem.${problem}`)}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("weight.scrapPerPieceShort")}</dt>
          <dd className="font-medium tabular-nums">
            {figures ? formatWeight(figures.scrapPerPieceMg) : dash}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("weight.totalScrap")}</dt>
          <dd className="font-semibold tabular-nums">
            {figures ? formatWeight(figures.totalScrapMg) : dash}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("weight.scrapValue")}</dt>
          <dd className="font-semibold tabular-nums">
            {figures && figures.totalValuePaise !== null
              ? formatRupeesFromPaise(figures.totalValuePaise)
              : dash}
          </dd>
        </div>
      </dl>
      {figures && figures.totalValuePaise === null && (
        <p className="text-xs text-muted-foreground">{t("weight.noRateValue")}</p>
      )}

      {line.weight && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-destructive hover:text-destructive sm:h-8"
          onClick={() => onChange({ remove: true })}
        >
          <Trash2 className="h-4 w-4" /> {t("weight.removeWeight")}
        </Button>
      )}
    </div>
  );
}

function WeightInput({
  label,
  text,
  unit,
  invalid,
  onText,
  onUnit,
}: {
  label: string;
  text: string;
  unit: WeightUnit;
  invalid: boolean;
  onText: (text: string) => void;
  onUnit: (unit: WeightUnit) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="col-span-2 space-y-1 sm:col-span-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        <Input
          inputMode="decimal"
          value={text}
          aria-label={label}
          aria-invalid={invalid || undefined}
          onChange={(e) => onText(e.target.value)}
          className="h-11 min-w-0 flex-1 tabular-nums sm:h-9"
        />
        <div
          role="group"
          aria-label={t("weight.unit")}
          className="flex shrink-0 overflow-hidden rounded-md border"
        >
          {(["g", "kg"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => onUnit(u)}
              className={`h-11 w-10 text-sm font-medium sm:h-9 ${
                unit === u
                  ? "bg-[#10233f] text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {u === "g" ? t("weight.grams") : t("weight.kilograms")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadOnlyLine({ line }: { line: WeightLine }) {
  const { t } = useI18n();
  const dash = t("weight.notEntered");
  const w = line.weight;
  const figures = w ? storedScrapFigures(w, line.sentQty) : null;
  const item = (label: string, value: string, strong = false) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {item(t("weight.sentFromDc"), qty(line.sentQty), true)}
      {item(
        t("weight.roughShort"),
        w && isWeightUnit(w.rough_unit)
          ? formatWeightIn(gramsToMilligrams(w.rough_weight_g), w.rough_unit)
          : dash
      )}
      {item(
        t("weight.finishedShort"),
        w && isWeightUnit(w.finished_unit)
          ? formatWeightIn(gramsToMilligrams(w.finished_weight_g), w.finished_unit)
          : dash
      )}
      {item(t("weight.scrapPerPieceShort"), figures ? formatWeight(figures.scrapPerPieceMg) : dash)}
      {item(t("weight.totalScrap"), figures ? formatWeight(figures.totalScrapMg) : dash, true)}
      {item(
        t("weight.scrapRate"),
        figures?.ratePaisePerKg != null
          ? `${formatRupeesFromPaise(figures.ratePaisePerKg)} / kg`
          : dash
      )}
      {item(
        t("weight.scrapValue"),
        figures?.totalValuePaise != null ? formatRupeesFromPaise(figures.totalValuePaise) : dash,
        true
      )}
    </dl>
  );
}

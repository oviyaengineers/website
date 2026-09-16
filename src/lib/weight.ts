/**
 * Weight and scrap for one delivery challan line.
 *
 * Rough and finished weights are per piece, entered in grams or kilograms.
 * Scrap is worked out, never typed:
 *
 *   scrap per piece   = rough per piece − finished per piece
 *   total scrap       = scrap per piece × the line's own Sent Qty
 *   total scrap value = total scrap (kg) × scrap rate (₹/kg)
 *
 * Only Sent counts. Material Problem and Rejection pieces are not scrap here.
 *
 * All arithmetic runs in whole milligrams and whole paise, so 1200 g against
 * 1 kg, or 0.1 + 0.2 kg, never picks up a floating-point remainder. The
 * database stores grams to 0.001 g, which is exactly one milligram.
 *
 * Deliberately separate from billing: nothing here reads or writes invoices,
 * rates or allocations.
 */

export type WeightUnit = "g" | "kg";

export const WEIGHT_UNITS: readonly WeightUnit[] = ["g", "kg"];

/** Decimal places each unit accepts, so every entry is a whole milligram. */
export const WEIGHT_DECIMALS: Record<WeightUnit, number> = { g: 3, kg: 6 };

/** Scrap rate is rupees and paise. */
export const RATE_DECIMALS = 2;

/** The largest weight the database column holds, in milligrams (99,999,999,999.999 g). */
export const MAX_WEIGHT_MG = 99_999_999_999_999;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "g" || value === "kg";
}

export type ParsedNumber =
  { ok: true; value: string | null } | { ok: false; reason: "invalid" | "negative" | "decimals" };

/**
 * Check a typed number without turning it into a float.
 *
 * Blank is allowed and means "not entered". The digits are kept as text so
 * the exact value typed is what gets converted.
 */
export function parseDecimal(text: string | null | undefined, decimals: number): ParsedNumber {
  const trimmed = (text ?? "").trim().replace(/,/g, "");
  if (trimmed === "") return { ok: true, value: null };
  if (/^-/.test(trimmed)) return { ok: false, reason: "negative" };
  const match = /^(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[1] === "" && (match[2] ?? "") === ""))
    return { ok: false, reason: "invalid" };
  if ((match[2] ?? "").length > decimals) return { ok: false, reason: "decimals" };
  return { ok: true, value: trimmed };
}

/** A decimal string as a whole number of 10^-scale units, e.g. ("1.2", 6) → 1200000. */
function toScaled(value: string, scale: number): number {
  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole || "0"}${fraction.padEnd(scale, "0").slice(0, scale)}`;
  return Number(BigInt(digits));
}

/** A weight as typed, in milligrams. Null when blank or not a valid weight. */
export function toMilligrams(text: string | null | undefined, unit: WeightUnit): number | null {
  const parsed = parseDecimal(text, WEIGHT_DECIMALS[unit]);
  if (!parsed.ok || parsed.value === null) return null;
  return toScaled(parsed.value, unit === "kg" ? 6 : 3);
}

/** Grams as stored (numeric, 3 decimals) to milligrams. */
export function gramsToMilligrams(grams: number | string): number {
  return Math.round(Number(grams) * 1000);
}

/** A rate as typed, in paise per kg. Null when blank or invalid. */
export function toPaisePerKg(text: string | null | undefined): number | null {
  const parsed = parseDecimal(text, RATE_DECIMALS);
  if (!parsed.ok || parsed.value === null) return null;
  return toScaled(parsed.value, RATE_DECIMALS);
}

/** A stored weight shown back in the unit it was entered in, without trailing zeros. */
export function milligramsInUnit(mg: number, unit: WeightUnit): string {
  return trimDecimal(fixed(BigInt(Math.round(mg)), unit === "kg" ? 6 : 3));
}

/** Rupees as stored back to the text shown in the rate box. */
export function rateText(rupees: number | string | null | undefined): string {
  if (rupees === null || rupees === undefined || rupees === "") return "";
  return trimDecimal(Number(rupees).toFixed(2));
}

function fixed(value: bigint, scale: number): string {
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
}

function trimDecimal(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** Sent Qty as whole hundredths, matching the numeric(12,2) column. */
function hundredths(qty: number | string): bigint {
  return BigInt(Math.round(Number(qty) * 100));
}

export type WeightProblem =
  | "roughMissing"
  | "finishedMissing"
  | "roughInvalid"
  | "finishedInvalid"
  | "rateInvalid"
  | "negative"
  | "tooManyDecimals"
  | "finishedOverRough"
  | "tooLarge";

export type WeightEntry = {
  roughText: string;
  roughUnit: WeightUnit;
  finishedText: string;
  finishedUnit: WeightUnit;
  rateText: string;
};

export type ScrapFigures = {
  roughMg: number;
  finishedMg: number;
  scrapPerPieceMg: number;
  /** Scrap per piece × Sent, in milligrams (may carry a fraction when Sent does). */
  totalScrapMg: number;
  /** Null when no rate has been entered: a rate is never assumed. */
  ratePaisePerKg: number | null;
  /** Total scrap value in paise, rounded half up. Null without a rate. */
  totalValuePaise: number | null;
};

export type ScrapResult =
  { ok: true; figures: ScrapFigures } | { ok: false; problems: WeightProblem[] };

/** Everything that is wrong with an entry, in the order worth reading. */
export function validateWeightEntry(entry: WeightEntry): WeightProblem[] {
  const problems: WeightProblem[] = [];
  const rough = parseDecimal(entry.roughText, WEIGHT_DECIMALS[entry.roughUnit]);
  const finished = parseDecimal(entry.finishedText, WEIGHT_DECIMALS[entry.finishedUnit]);
  const rate = parseDecimal(entry.rateText, RATE_DECIMALS);

  for (const [parsed, invalid] of [
    [rough, "roughInvalid"],
    [finished, "finishedInvalid"],
    [rate, "rateInvalid"],
  ] as const) {
    if (parsed.ok) continue;
    const problem =
      parsed.reason === "negative"
        ? "negative"
        : parsed.reason === "decimals"
          ? "tooManyDecimals"
          : invalid;
    if (!problems.includes(problem)) problems.push(problem);
  }
  if (rough.ok && rough.value === null) problems.push("roughMissing");
  if (finished.ok && finished.value === null) problems.push("finishedMissing");
  if (problems.length > 0) return problems;

  const roughMg = toMilligrams(entry.roughText, entry.roughUnit) ?? 0;
  const finishedMg = toMilligrams(entry.finishedText, entry.finishedUnit) ?? 0;
  if (roughMg > MAX_WEIGHT_MG || finishedMg > MAX_WEIGHT_MG) return ["tooLarge"];
  if (finishedMg > roughMg) return ["finishedOverRough"];
  return [];
}

/**
 * The scrap figures for one line, or what stops them being worked out.
 *
 * sentQty is the line's own current Sent Qty, read from the challan.
 */
export function calculateScrap(entry: WeightEntry, sentQty: number | string): ScrapResult {
  const problems = validateWeightEntry(entry);
  if (problems.length > 0) return { ok: false, problems };

  const roughMg = toMilligrams(entry.roughText, entry.roughUnit) ?? 0;
  const finishedMg = toMilligrams(entry.finishedText, entry.finishedUnit) ?? 0;
  return {
    ok: true,
    figures: scrapFigures(roughMg, finishedMg, sentQty, toPaisePerKg(entry.rateText)),
  };
}

/** The same calculation from values already stored. */
export function scrapFigures(
  roughMg: number,
  finishedMg: number,
  sentQty: number | string,
  ratePaisePerKg: number | null
): ScrapFigures {
  const scrapPerPieceMg = Math.max(0, roughMg - finishedMg);
  // Exact: mg × hundredths of a piece, divided back by 100 only for display.
  const scrapMgHundredths = BigInt(scrapPerPieceMg) * hundredths(sentQty);
  const totalScrapMg = Number(scrapMgHundredths) / 100;

  let totalValuePaise: number | null = null;
  if (ratePaisePerKg !== null) {
    // value (paise) = scrap mg/100 ÷ 1,000,000 × rate paise, rounded half up.
    const numerator = scrapMgHundredths * BigInt(ratePaisePerKg);
    const denominator = BigInt(100_000_000);
    totalValuePaise = Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
  }

  return {
    roughMg,
    finishedMg,
    scrapPerPieceMg,
    totalScrapMg,
    ratePaisePerKg,
    totalValuePaise,
  };
}

/** A weight for reading: grams under a kilogram, kilograms from there, grouped the Indian way. */
export function formatWeight(mg: number): string {
  const abs = Math.abs(mg);
  if (abs < 1_000_000) {
    return `${(mg / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`;
  }
  return `${(mg / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;
}

/** A weight per piece, in the unit it was entered in. */
export function formatWeightIn(mg: number, unit: WeightUnit): string {
  const value = unit === "kg" ? mg / 1_000_000 : mg / 1000;
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: unit === "kg" ? 6 : 3 })} ${unit}`;
}

/** Rupees with paise, grouped the Indian way: ₹8,000.00. */
export function formatRupeesFromPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A stored weight record, as the screens read it. */
export type StoredWeight = {
  rough_weight_g: number | string;
  rough_unit: string;
  finished_weight_g: number | string;
  finished_unit: string;
  scrap_rate_per_kg: number | string | null;
  sent_qty_at_save: number | string;
};

export type WeightStatus = "notWeighed" | "rateMissing" | "weighed" | "sentChanged";

/**
 * Where a line stands.
 *
 * "Sent changed" wins over the others: the figures are already recalculated on
 * the current Sent Qty, but the weights were entered against another one and
 * are worth a second look.
 */
export function weightStatus(weight: StoredWeight | null, sentQty: number | string): WeightStatus {
  if (!weight) return "notWeighed";
  if (hundredths(weight.sent_qty_at_save) !== hundredths(sentQty)) return "sentChanged";
  if (weight.scrap_rate_per_kg === null || weight.scrap_rate_per_kg === "") return "rateMissing";
  return "weighed";
}

/** Stored values through the calculation, on the line's current Sent Qty. */
export function storedScrapFigures(weight: StoredWeight, sentQty: number | string): ScrapFigures {
  const rate =
    weight.scrap_rate_per_kg === null || weight.scrap_rate_per_kg === ""
      ? null
      : Math.round(Number(weight.scrap_rate_per_kg) * 100);
  return scrapFigures(
    gramsToMilligrams(weight.rough_weight_g),
    gramsToMilligrams(weight.finished_weight_g),
    sentQty,
    rate
  );
}

/** Totals for a set of weighed lines, ready for a report. */
export type WeightTotals = {
  lines: number;
  weighedLines: number;
  /** Sent pieces on weighed lines. */
  processedQty: number;
  totalRoughMg: number;
  totalFinishedMg: number;
  totalScrapMg: number;
  /** Scrap on lines that have a rate, which is what the value covers. */
  pricedScrapMg: number;
  totalValuePaise: number;
  /** Value ÷ priced scrap, in paise per kg. Null when nothing is priced. */
  averageRatePaisePerKg: number | null;
};

export function summarizeWeights(
  lines: { sentQty: number | string; weight: StoredWeight | null }[]
): WeightTotals {
  const totals: WeightTotals = {
    lines: lines.length,
    weighedLines: 0,
    processedQty: 0,
    totalRoughMg: 0,
    totalFinishedMg: 0,
    totalScrapMg: 0,
    pricedScrapMg: 0,
    totalValuePaise: 0,
    averageRatePaisePerKg: null,
  };
  let qtyHundredths = BigInt(0);
  for (const line of lines) {
    if (!line.weight) continue;
    const figures = storedScrapFigures(line.weight, line.sentQty);
    const qty = hundredths(line.sentQty);
    totals.weighedLines += 1;
    qtyHundredths += qty;
    totals.totalRoughMg += Number(BigInt(figures.roughMg) * qty) / 100;
    totals.totalFinishedMg += Number(BigInt(figures.finishedMg) * qty) / 100;
    totals.totalScrapMg += figures.totalScrapMg;
    if (figures.totalValuePaise !== null) {
      totals.pricedScrapMg += figures.totalScrapMg;
      totals.totalValuePaise += figures.totalValuePaise;
    }
  }
  totals.processedQty = Number(qtyHundredths) / 100;
  totals.averageRatePaisePerKg =
    totals.pricedScrapMg > 0
      ? Math.round(totals.totalValuePaise / (totals.pricedScrapMg / 1_000_000))
      : null;
  return totals;
}

export type DatePreset = "today" | "week" | "month";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The From/To dates for a quick filter, from India's today (yyyy-mm-dd).
 *
 * A week runs Monday to Sunday. Both ends are included, as everywhere else.
 */
export function datePresetRange(preset: DatePreset, today: string): { from: string; to: string } {
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const from = shiftDate(today, -((weekday + 6) % 7));
    return { from, to: shiftDate(from, 6) };
  }
  const from = `${today.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: shiftDate(next.toISOString().slice(0, 10), -1) };
}

/** Which quick filter a From/To pair is, if any. */
export function presetFor(
  from: string | undefined,
  to: string | undefined,
  today: string
): DatePreset | null {
  if (!from || !to) return null;
  for (const preset of ["today", "week", "month"] as const) {
    const range = datePresetRange(preset, today);
    if (range.from === from && range.to === to) return preset;
  }
  return null;
}

/**
 * Weight and scrap: the Weight Master and one delivery challan line.
 *
 * Rough and finished weights per piece live in the Weight Master, one record
 * per Component + Material, entered in grams or kilograms. Scrap is worked
 * out, never typed:
 *
 *   scrap per piece   = rough per piece − finished per piece
 *   total scrap       = scrap per piece × Sent Qty
 *   total scrap value = total scrap (kg) × scrap rate (₹/kg)
 *
 * Once a line is recorded, its weights, the Sent Qty used and the totals are
 * stored on the record and shown as stored. Only Sent counts. Material
 * Problem and Rejection pieces are not scrap here.
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

/** The heaviest piece the master accepts: 10,000 kg, as the database checks. */
export const MAX_PIECE_MG = 10_000_000_000;

/** The largest rate accepted, ₹ per kg. */
export const MAX_RATE_PAISE = 999_999_999_99;

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

/** Milligrams to the grams text the database takes, exactly. */
export function milligramsToGramsText(mg: number): string {
  return fixed(BigInt(Math.round(mg)), 3);
}

/** A rate as typed, in paise per kg. Null when blank or invalid. */
export function toPaisePerKg(text: string | null | undefined): number | null {
  const parsed = parseDecimal(text, RATE_DECIMALS);
  if (!parsed.ok || parsed.value === null) return null;
  return toScaled(parsed.value, RATE_DECIMALS);
}

/** A stored weight shown back in a unit, without trailing zeros. */
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

/** Two quantities as stored (2 decimals) are the same. */
export function sameQty(a: number | string, b: number | string): boolean {
  return hundredths(a) === hundredths(b);
}

// ---------------------------------------------------------------------------
// The Weight Master entry.

export type MasterEntry = {
  roughText: string;
  finishedText: string;
  unit: WeightUnit;
};

export type MasterProblem =
  | "roughMissing"
  | "finishedMissing"
  | "roughInvalid"
  | "finishedInvalid"
  | "negative"
  | "tooManyDecimals"
  | "finishedOverRough"
  | "tooLarge";

/** Everything wrong with a master's weights, in the order worth reading. */
export function validateMasterEntry(entry: MasterEntry): MasterProblem[] {
  const problems: MasterProblem[] = [];
  const decimals = WEIGHT_DECIMALS[entry.unit];
  const rough = parseDecimal(entry.roughText, decimals);
  const finished = parseDecimal(entry.finishedText, decimals);

  for (const [parsed, invalid] of [
    [rough, "roughInvalid"],
    [finished, "finishedInvalid"],
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

  const roughMg = toMilligrams(entry.roughText, entry.unit) ?? 0;
  const finishedMg = toMilligrams(entry.finishedText, entry.unit) ?? 0;
  if (roughMg > MAX_PIECE_MG) return ["tooLarge"];
  if (finishedMg > roughMg) return ["finishedOverRough"];
  return [];
}

export const MASTER_PROBLEM_TEXT: Record<MasterProblem, string> = {
  roughMissing: "Enter the rough weight per piece.",
  finishedMissing: "Enter the finished weight per piece.",
  roughInvalid: "Rough weight is not a number.",
  finishedInvalid: "Finished weight is not a number.",
  negative: "Weights cannot be negative.",
  tooManyDecimals: "Too many decimal places: up to 3 for g, 6 for kg.",
  finishedOverRough: "Finished weight cannot be more than rough weight.",
  tooLarge: "A piece cannot weigh more than 10,000 kg.",
};

/** Scrap per piece for a valid entry, in milligrams; null while it is not valid. */
export function masterScrapMg(entry: MasterEntry): number | null {
  if (validateMasterEntry(entry).length > 0) return null;
  return (
    (toMilligrams(entry.roughText, entry.unit) ?? 0) -
    (toMilligrams(entry.finishedText, entry.unit) ?? 0)
  );
}

// ---------------------------------------------------------------------------
// The scrap rate, typed per recorded line.

export type RateProblem =
  "rateMissing" | "rateInvalid" | "negative" | "tooManyDecimals" | "tooLarge";

export function validateRate(text: string): RateProblem | null {
  const parsed = parseDecimal(text, RATE_DECIMALS);
  if (!parsed.ok) {
    return parsed.reason === "negative"
      ? "negative"
      : parsed.reason === "decimals"
        ? "tooManyDecimals"
        : "rateInvalid";
  }
  if (parsed.value === null) return "rateMissing";
  if ((toPaisePerKg(text) ?? 0) > MAX_RATE_PAISE) return "tooLarge";
  return null;
}

export const RATE_PROBLEM_TEXT: Record<RateProblem, string> = {
  rateMissing: "Enter the scrap rate (₹/kg). Zero is allowed.",
  rateInvalid: "Scrap rate is not a number.",
  negative: "Scrap rate cannot be negative.",
  tooManyDecimals: "Scrap rate takes up to 2 decimal places.",
  tooLarge: "Scrap rate is too large.",
};

// ---------------------------------------------------------------------------
// The calculation.

export type ScrapFigures = {
  scrapPerPieceMg: number;
  /** Scrap per piece × Sent, in milligrams (may carry a fraction when Sent does). */
  totalScrapMg: number;
  /** Null when no rate is known: a rate is never assumed. */
  totalValuePaise: number | null;
};

/** Scrap per piece, total scrap and value from weights, Sent Qty and a rate. */
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
  return { scrapPerPieceMg, totalScrapMg, totalValuePaise };
}

/** A weight for reading: grams under a kilogram, kilograms from there, grouped the Indian way. */
export function formatWeight(mg: number): string {
  const abs = Math.abs(mg);
  if (abs < 1_000_000) {
    return `${(mg / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`;
  }
  return `${(mg / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;
}

/** A weight per piece, in a given unit. */
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

// ---------------------------------------------------------------------------
// Where a line stands.

/**
 * notConfigured: no active master for its Component + Material, so no weights.
 * pending:       an active master matches; not recorded yet.
 * recorded:      recorded, and Sent Qty still matches.
 * sentChanged:   recorded, but the DC's Sent Qty has changed since.
 */
export type WeightStatus = "notConfigured" | "pending" | "recorded" | "sentChanged";

export const WEIGHT_STATUS_TEXT: Record<WeightStatus, string> = {
  notConfigured: "Weight not configured",
  pending: "Pending",
  recorded: "Recorded",
  sentChanged: "Sent Qty changed",
};

export const NOT_CONFIGURED_TEXT = "Weight not configured for this Component/Material.";
export const SENT_CHANGED_TEXT = "Sent Qty changed since weights were saved.";

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

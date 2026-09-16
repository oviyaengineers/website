import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateScrap,
  datePresetRange,
  formatRupeesFromPaise,
  formatWeight,
  milligramsInUnit,
  parseDecimal,
  presetFor,
  rateText,
  storedScrapFigures,
  summarizeWeights,
  toMilligrams,
  toPaisePerKg,
  validateWeightEntry,
  weightStatus,
  type WeightEntry,
} from "@/lib/weight";

function entry(over: Partial<WeightEntry> = {}): WeightEntry {
  return {
    roughText: "1.20",
    roughUnit: "kg",
    finishedText: "1.00",
    finishedUnit: "kg",
    rateText: "80",
    ...over,
  };
}

function figures(e: WeightEntry, sent: number | string) {
  const result = calculateScrap(e, sent);
  assert.equal(result.ok, true, JSON.stringify(result));
  return (result as Extract<typeof result, { ok: true }>).figures;
}

test("the worked example: Shaft, 500 pcs, 1.20 kg → 1.00 kg at ₹80/kg", () => {
  const f = figures(entry(), 500);
  assert.equal(f.scrapPerPieceMg, 200_000, "0.20 kg scrap per piece");
  assert.equal(f.totalScrapMg, 100_000_000, "100 kg total scrap");
  assert.equal(f.totalValuePaise, 800_000, "₹8,000 value");
  assert.equal(formatWeight(f.scrapPerPieceMg), "200 g");
  assert.equal(formatWeight(f.totalScrapMg), "100 kg");
  assert.equal(formatRupeesFromPaise(f.totalValuePaise!), "₹8,000.00");
});

test("rough in grams, finished in kilograms", () => {
  const f = figures(
    entry({ roughText: "1200", roughUnit: "g", finishedText: "1", finishedUnit: "kg" }),
    500
  );
  assert.equal(f.roughMg, 1_200_000);
  assert.equal(f.finishedMg, 1_000_000);
  assert.equal(f.scrapPerPieceMg, 200_000, "200 g per piece");
  assert.equal(f.totalValuePaise, 800_000);
});

test("rough in kilograms, finished in grams", () => {
  const f = figures(
    entry({ roughText: "1.2", roughUnit: "kg", finishedText: "1000", finishedUnit: "g" }),
    500
  );
  assert.equal(f.scrapPerPieceMg, 200_000);
});

test("both in grams", () => {
  const f = figures(
    entry({
      roughText: "350.5",
      roughUnit: "g",
      finishedText: "300.25",
      finishedUnit: "g",
      rateText: "",
    }),
    10
  );
  assert.equal(f.scrapPerPieceMg, 50_250);
  assert.equal(f.totalScrapMg, 502_500);
  assert.equal(formatWeight(f.totalScrapMg), "502.5 g");
});

test("unit conversion is exact, with no floating-point remainder", () => {
  assert.equal(toMilligrams("0.1", "kg"), 100_000);
  assert.equal(
    toMilligrams("0.3", "kg")! - toMilligrams("0.1", "kg")! - toMilligrams("0.2", "kg")!,
    0
  );
  assert.equal(toMilligrams("1.000001", "kg"), 1_000_001);
  assert.equal(toMilligrams("0.001", "g"), 1);
  assert.equal(toMilligrams("1,200", "g"), 1_200_000);
  assert.equal(milligramsInUnit(1_200_000, "kg"), "1.2");
  assert.equal(milligramsInUnit(1_200_000, "g"), "1200");
  assert.equal(milligramsInUnit(1_000, "g"), "1");
});

test("zero scrap is allowed when rough equals finished", () => {
  const f = figures(
    entry({ roughText: "1", roughUnit: "kg", finishedText: "1000", finishedUnit: "g" }),
    500
  );
  assert.equal(f.scrapPerPieceMg, 0);
  assert.equal(f.totalScrapMg, 0);
  assert.equal(f.totalValuePaise, 0);
});

test("finished heavier than rough is refused", () => {
  assert.deepEqual(validateWeightEntry(entry({ roughText: "1.00", finishedText: "1.20" })), [
    "finishedOverRough",
  ]);
  assert.deepEqual(
    validateWeightEntry(
      entry({ roughText: "999", roughUnit: "g", finishedText: "1", finishedUnit: "kg" })
    ),
    ["finishedOverRough"]
  );
  assert.equal(calculateScrap(entry({ roughText: "1.00", finishedText: "1.20" }), 500).ok, false);
});

test("negative scrap is impossible: negatives are refused and scrap never goes below zero", () => {
  assert.deepEqual(validateWeightEntry(entry({ roughText: "-1" })), ["negative"]);
  assert.deepEqual(validateWeightEntry(entry({ finishedText: "-0.5" })), ["negative"]);
  assert.deepEqual(validateWeightEntry(entry({ rateText: "-80" })), ["negative"]);
  // Even handed stored values the wrong way round, the figure floors at zero.
  const f = storedScrapFigures(
    {
      rough_weight_g: 1000,
      rough_unit: "g",
      finished_weight_g: 1200,
      finished_unit: "g",
      scrap_rate_per_kg: 80,
      sent_qty_at_save: 5,
    },
    5
  );
  assert.equal(f.scrapPerPieceMg, 0);
});

test("missing and invalid entries are named", () => {
  assert.deepEqual(validateWeightEntry(entry({ roughText: "" })), ["roughMissing"]);
  assert.deepEqual(validateWeightEntry(entry({ roughText: "", finishedText: "" })), [
    "roughMissing",
    "finishedMissing",
  ]);
  assert.deepEqual(validateWeightEntry(entry({ roughText: "abc" })), ["roughInvalid"]);
  assert.deepEqual(validateWeightEntry(entry({ finishedText: "1.2.3" })), ["finishedInvalid"]);
  assert.deepEqual(validateWeightEntry(entry({ rateText: "8o" })), ["rateInvalid"]);
  assert.deepEqual(validateWeightEntry(entry({ roughText: "1.0001", roughUnit: "g" })), [
    "tooManyDecimals",
  ]);
  assert.deepEqual(validateWeightEntry(entry({ rateText: "80.005" })), ["tooManyDecimals"]);
  assert.deepEqual(validateWeightEntry(entry({ roughText: "999999999999", roughUnit: "kg" })), [
    "tooLarge",
  ]);
});

test("the scrap rate is manual: no rate means no value, never an assumed one", () => {
  const f = figures(entry({ rateText: "" }), 500);
  assert.equal(f.ratePaisePerKg, null);
  assert.equal(f.totalValuePaise, null);
  assert.equal(f.totalScrapMg, 100_000_000, "scrap is still worked out");
  assert.equal(toPaisePerKg("80"), 8000);
  assert.equal(toPaisePerKg("12.5"), 1250);
  assert.equal(rateText(80), "80");
  assert.equal(rateText("12.50"), "12.5");
  assert.equal(rateText(null), "");
});

test("total scrap uses Sent Qty, and changes with it", () => {
  assert.equal(figures(entry(), 500).totalScrapMg, 100_000_000);
  assert.equal(figures(entry(), 499).totalScrapMg, 99_800_000);
  assert.equal(figures(entry(), "250.00").totalValuePaise, 400_000);
  assert.equal(figures(entry(), 0).totalScrapMg, 0);
});

test("value rounds half up to the paisa", () => {
  // 1 mg scrap × 1 piece × ₹5/kg = 0.0005 paise → 0; 100 mg × 1 × ₹5/kg = 0.05 paise → 0;
  // 1 g × 1 × ₹5/kg = 0.5 paise → 1.
  assert.equal(
    figures(
      entry({
        roughText: "2",
        roughUnit: "g",
        finishedText: "1",
        finishedUnit: "g",
        rateText: "5",
      }),
      1
    ).totalValuePaise,
    1
  );
  assert.equal(
    figures(
      entry({
        roughText: "1.4",
        roughUnit: "g",
        finishedText: "1",
        finishedUnit: "g",
        rateText: "5",
      }),
      1
    ).totalValuePaise,
    0
  );
});

test("large lots stay exact", () => {
  const f = figures(
    entry({
      roughText: "12.345678",
      roughUnit: "kg",
      finishedText: "0.000001",
      finishedUnit: "kg",
      rateText: "99999.99",
    }),
    "123456.78"
  );
  // 12,345,677 mg × 123,456.78 pcs
  assert.equal(f.totalScrapMg, 1_524_157_529_340.06);
  assert.ok(Number.isFinite(f.totalValuePaise!));
});

test("status per line", () => {
  const stored = {
    rough_weight_g: 1200,
    rough_unit: "kg",
    finished_weight_g: 1000,
    finished_unit: "kg",
    scrap_rate_per_kg: 80,
    sent_qty_at_save: 500,
  };
  assert.equal(weightStatus(null, 500), "notWeighed");
  assert.equal(weightStatus(stored, 500), "weighed");
  assert.equal(weightStatus(stored, "500.00"), "weighed");
  assert.equal(weightStatus({ ...stored, scrap_rate_per_kg: null }, 500), "rateMissing");
  assert.equal(weightStatus(stored, 480), "sentChanged");
});

test("stored figures are recalculated on the current Sent Qty", () => {
  const stored = {
    rough_weight_g: "1200.000",
    rough_unit: "kg",
    finished_weight_g: "1000.000",
    finished_unit: "kg",
    scrap_rate_per_kg: "80.00",
    sent_qty_at_save: "500.00",
  };
  assert.equal(storedScrapFigures(stored, 500).totalValuePaise, 800_000);
  assert.equal(storedScrapFigures(stored, 400).totalValuePaise, 640_000);
});

test("different lines stay separate in the totals", () => {
  const shaft = {
    rough_weight_g: 1200,
    rough_unit: "kg",
    finished_weight_g: 1000,
    finished_unit: "kg",
    scrap_rate_per_kg: 80,
    sent_qty_at_save: 100,
  };
  const flange = {
    rough_weight_g: 500,
    rough_unit: "g",
    finished_weight_g: 450,
    finished_unit: "g",
    scrap_rate_per_kg: null,
    sent_qty_at_save: 200,
  };
  const totals = summarizeWeights([
    { sentQty: 100, weight: shaft },
    { sentQty: 200, weight: flange },
    { sentQty: 150, weight: null },
  ]);
  assert.equal(totals.lines, 3);
  assert.equal(totals.weighedLines, 2);
  assert.equal(totals.processedQty, 300);
  assert.equal(totals.totalRoughMg, 120_000_000 + 100_000_000);
  assert.equal(totals.totalFinishedMg, 100_000_000 + 90_000_000);
  assert.equal(totals.totalScrapMg, 20_000_000 + 10_000_000, "20 kg + 10 kg");
  assert.equal(totals.pricedScrapMg, 20_000_000, "only the shaft has a rate");
  assert.equal(totals.totalValuePaise, 160_000, "₹1,600 from the shaft alone");
  assert.equal(totals.averageRatePaisePerKg, 8000);
});

test("parseDecimal keeps the digits as typed", () => {
  assert.deepEqual(parseDecimal(" 1.50 ", 3), { ok: true, value: "1.50" });
  assert.deepEqual(parseDecimal("", 3), { ok: true, value: null });
  assert.deepEqual(parseDecimal(".5", 3), { ok: true, value: ".5" });
  assert.deepEqual(parseDecimal(".", 3), { ok: false, reason: "invalid" });
  assert.deepEqual(parseDecimal("1e3", 3), { ok: false, reason: "invalid" });
});

test("date presets use the India business date, weeks Monday to Sunday", () => {
  assert.deepEqual(datePresetRange("today", "2026-09-16"), {
    from: "2026-09-16",
    to: "2026-09-16",
  });
  // 16 Sep 2026 is a Wednesday.
  assert.deepEqual(datePresetRange("week", "2026-09-16"), { from: "2026-09-14", to: "2026-09-20" });
  assert.deepEqual(datePresetRange("week", "2026-09-14"), { from: "2026-09-14", to: "2026-09-20" });
  assert.deepEqual(datePresetRange("week", "2026-09-20"), { from: "2026-09-14", to: "2026-09-20" });
  assert.deepEqual(datePresetRange("month", "2026-09-16"), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.deepEqual(datePresetRange("month", "2028-02-10"), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
  assert.deepEqual(datePresetRange("week", "2026-12-31"), { from: "2026-12-28", to: "2027-01-03" });
  assert.equal(presetFor("2026-09-14", "2026-09-20", "2026-09-16"), "week");
  assert.equal(presetFor("2026-09-10", "2026-09-20", "2026-09-16"), null);
});

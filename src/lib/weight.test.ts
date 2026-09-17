import assert from "node:assert/strict";
import { test } from "node:test";
import {
  datePresetRange,
  formatRupeesFromPaise,
  formatWeight,
  formatWeightIn,
  masterScrapMg,
  milligramsInUnit,
  milligramsToGramsText,
  parseDecimal,
  presetFor,
  rateText,
  sameQty,
  scrapFigures,
  toMilligrams,
  toPaisePerKg,
  validateMasterEntry,
  validateRate,
  type MasterEntry,
} from "@/lib/weight";

function entry(over: Partial<MasterEntry> = {}): MasterEntry {
  return { roughText: "1.20", finishedText: "1.00", unit: "kg", ...over };
}

test("the worked example: Shaft / EN8, 1.20 kg → 1.00 kg, 500 pcs at ₹80/kg", () => {
  const scrap = masterScrapMg(entry());
  assert.equal(scrap, 200_000, "0.20 kg scrap per piece");
  assert.equal(formatWeightIn(scrap!, "kg"), "0.2 kg");
  const f = scrapFigures(1_200_000, 1_000_000, 500, toPaisePerKg("80"));
  assert.equal(f.scrapPerPieceMg, 200_000);
  assert.equal(f.totalScrapMg, 100_000_000, "100 kg total scrap");
  assert.equal(f.totalValuePaise, 800_000, "₹8,000 value");
  assert.equal(formatWeight(f.totalScrapMg), "100 kg");
  assert.equal(formatRupeesFromPaise(f.totalValuePaise!), "₹8,000.00");
});

test("the master works in one unit, stored as grams exactly", () => {
  assert.equal(
    masterScrapMg(entry({ roughText: "350.5", finishedText: "300.25", unit: "g" })),
    50_250
  );
  assert.equal(milligramsToGramsText(toMilligrams("1.2", "kg")!), "1200.000");
  assert.equal(milligramsToGramsText(toMilligrams("0.001", "g")!), "0.001");
  assert.equal(milligramsToGramsText(toMilligrams("1.000001", "kg")!), "1000.001");
  assert.equal(milligramsInUnit(1_200_000, "kg"), "1.2");
  assert.equal(milligramsInUnit(1_200_000, "g"), "1200");
});

test("unit conversion is exact, with no floating-point remainder", () => {
  assert.equal(toMilligrams("0.1", "kg"), 100_000);
  assert.equal(
    toMilligrams("0.3", "kg")! - toMilligrams("0.1", "kg")! - toMilligrams("0.2", "kg")!,
    0
  );
  assert.equal(toMilligrams("1,200", "g"), 1_200_000);
});

test("zero scrap is allowed", () => {
  assert.deepEqual(validateMasterEntry(entry({ roughText: "1", finishedText: "1.000" })), []);
  assert.equal(masterScrapMg(entry({ roughText: "1", finishedText: "1" })), 0);
});

test("finished heavier than rough is refused", () => {
  assert.deepEqual(validateMasterEntry(entry({ roughText: "1.00", finishedText: "1.20" })), [
    "finishedOverRough",
  ]);
  assert.equal(masterScrapMg(entry({ roughText: "1.00", finishedText: "1.20" })), null);
});

test("negative, missing, invalid and oversized weights are refused", () => {
  assert.deepEqual(validateMasterEntry(entry({ roughText: "-1" })), ["negative"]);
  assert.deepEqual(validateMasterEntry(entry({ finishedText: "-0.5" })), ["negative"]);
  assert.deepEqual(validateMasterEntry(entry({ roughText: "" })), ["roughMissing"]);
  assert.deepEqual(validateMasterEntry(entry({ roughText: "", finishedText: "" })), [
    "roughMissing",
    "finishedMissing",
  ]);
  assert.deepEqual(validateMasterEntry(entry({ roughText: "abc" })), ["roughInvalid"]);
  assert.deepEqual(validateMasterEntry(entry({ finishedText: "1.2.3" })), ["finishedInvalid"]);
  assert.deepEqual(
    validateMasterEntry(entry({ roughText: "1.0001", finishedText: "1", unit: "g" })),
    ["tooManyDecimals"]
  );
  assert.deepEqual(validateMasterEntry(entry({ roughText: "10000.000001" })), ["tooLarge"]);
  assert.deepEqual(validateMasterEntry(entry({ roughText: "10000", finishedText: "1" })), []);
});

test("the scrap rate is required to record, zero allowed, never negative", () => {
  assert.equal(validateRate(""), "rateMissing");
  assert.equal(validateRate("0"), null);
  assert.equal(validateRate("80"), null);
  assert.equal(validateRate("-80"), "negative");
  assert.equal(validateRate("8o"), "rateInvalid");
  assert.equal(validateRate("80.005"), "tooManyDecimals");
  assert.equal(toPaisePerKg("12.5"), 1250);
  assert.equal(rateText(80), "80");
  assert.equal(rateText("12.50"), "12.5");
  assert.equal(rateText(null), "");
});

test("no rate means no value, never an assumed one", () => {
  const f = scrapFigures(1_200_000, 1_000_000, 500, null);
  assert.equal(f.totalValuePaise, null);
  assert.equal(f.totalScrapMg, 100_000_000);
});

test("total scrap follows the Sent Qty it is given", () => {
  assert.equal(scrapFigures(1_200_000, 1_000_000, 499, null).totalScrapMg, 99_800_000);
  assert.equal(scrapFigures(1_200_000, 1_000_000, "250.00", 8000).totalValuePaise, 400_000);
  assert.equal(scrapFigures(1_200_000, 1_000_000, 0, 8000).totalScrapMg, 0);
  assert.equal(sameQty("500.00", 500), true);
  assert.equal(sameQty(500, 499.99), false);
});

test("value rounds half up to the paisa", () => {
  assert.equal(scrapFigures(2_000, 1_000, 1, 500).totalValuePaise, 1);
  assert.equal(scrapFigures(1_400, 1_000, 1, 500).totalValuePaise, 0);
});

test("large lots stay exact", () => {
  const f = scrapFigures(12_345_678, 1, "123456.78", 9_999_999);
  assert.equal(f.totalScrapMg, 1_524_157_529_340.06);
  assert.ok(Number.isFinite(f.totalValuePaise!));
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
  assert.deepEqual(datePresetRange("week", "2026-09-16"), { from: "2026-09-14", to: "2026-09-20" });
  assert.deepEqual(datePresetRange("month", "2028-02-10"), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
  assert.deepEqual(datePresetRange("week", "2026-12-31"), { from: "2026-12-28", to: "2027-01-03" });
  assert.equal(presetFor("2026-09-14", "2026-09-20", "2026-09-16"), "week");
  assert.equal(presetFor("2026-09-10", "2026-09-20", "2026-09-16"), null);
});

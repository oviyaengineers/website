/**
 * Reading one photographed customer challan: prepare, read several ways,
 * combine. The recogniser and the preparation are passed in, so the browser
 * can run preparation in a background worker and Tesseract in its own worker,
 * and tests can run the very same steps directly.
 */

import { combineReadings, type CombinedScan, type Reading } from "@/lib/ocr/combine";
import { meanConfidence, wordsToRowText, type OcrWord } from "@/lib/ocr/layout-rows";
import type { Gray, OcrVariantName, PreparedForOcr } from "@/lib/ocr/preprocess";
import type { ParseInwardDcOptions } from "@/lib/ocr/parse-inward-dc";

export type Recognition = { text: string; words: OcrWord[] };

export type ScanStage = "improving" | "reading" | "matching";

export type ReadChallanDeps = {
  prepare: (options: { thorough: boolean; quarterTurns: number }) => Promise<PreparedForOcr>;
  recognize: (image: Gray, name: OcrVariantName) => Promise<Recognition>;
  onStage?: (stage: ScanStage, detail?: { pass: number; passes: number }) => void;
};

export type ChallanReading = CombinedScan & {
  report: PreparedForOcr["report"];
  /** The prepared image the best reading came from, for storing beside the original. */
  processed: Gray;
  /** Too poor to trust much: the review should offer a retake. */
  poorQuality: boolean;
};

/** Mean word confidence under which the page may be upside down or unreadable. */
const DOUBTFUL = 50;

export async function readChallan(
  deps: ReadChallanDeps,
  options: ParseInwardDcOptions & { thorough?: boolean }
): Promise<ChallanReading> {
  const thorough = options.thorough ?? false;
  deps.onStage?.("improving");
  let prepared = await deps.prepare({ thorough, quarterTurns: 0 });

  const readVariant = async (p: PreparedForOcr, index: number) => {
    const variant = p.variants[index];
    const result = await deps.recognize(variant.image, variant.name);
    return { variant, result, confidence: meanConfidence(result.words) };
  };

  deps.onStage?.("reading", { pass: 1, passes: prepared.variants.length });
  let first = await readVariant(prepared, 0);

  // Upside down reads as near-nonsense. Rows cannot tell 0° from 180°, so
  // when the first reading is doubtful the page is tried the other way up.
  if (first.confidence < DOUBTFUL) {
    const flipped = await deps.prepare({ thorough, quarterTurns: 2 });
    const second = await readVariant(flipped, 0);
    if (second.confidence > first.confidence + 5) {
      prepared = flipped;
      first = second;
    }
  }

  const results = [first];
  for (let i = 1; i < prepared.variants.length; i += 1) {
    deps.onStage?.("reading", { pass: i + 1, passes: prepared.variants.length });
    results.push(await readVariant(prepared, i));
  }

  deps.onStage?.("matching");
  const readings: Reading[] = [];
  for (const { variant, result, confidence } of results) {
    readings.push({ source: `${variant.name}/layout`, text: result.text, confidence });
    const rows = wordsToRowText(result.words);
    if (rows.trim()) readings.push({ source: `${variant.name}/rows`, text: rows, confidence });
  }
  const combined = combineReadings(readings, options);
  const bestVariant =
    results.find((r) => combined.bestSource.startsWith(`${r.variant.name}/`)) ?? results[0];

  return {
    ...combined,
    report: prepared.report,
    processed: bestVariant.variant.image,
    poorQuality:
      combined.readingConfidence < 60 ||
      prepared.report.blurred ||
      (combined.items.length === 0 && combined.newComponents.length === 0),
  };
}

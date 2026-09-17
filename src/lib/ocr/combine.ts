/**
 * Several readings of one challan, combined into one result with a
 * confidence for every field.
 *
 * The same page is read from differently prepared images (enhanced, black and
 * white, sharpened) and each reading is taken both in Tesseract's order and
 * row by row. No single reading is trusted: a value is only marked
 * high-confidence when independent readings agree on it and the words it came
 * from were read confidently. Everything else is marked for the operator to
 * verify. Components and materials still only ever come from the master list.
 */

import {
  foldOcrConfusables,
  parseInwardDc,
  type ParseInwardDcOptions,
  type ScannedInwardDc,
  type ScannedInwardItem,
} from "@/lib/ocr/parse-inward-dc";

export type Reading = {
  /** e.g. "enhanced/rows". */
  source: string;
  text: string;
  /** Mean word confidence, 0-100. */
  confidence: number;
};

export type FieldConfidence = "high" | "verify";

export type CombinedScan = ScannedInwardDc & {
  fieldConfidence: {
    customerId: FieldConfidence;
    customerDcNumber: FieldConfidence;
    customerDcDate: FieldConfidence;
  };
  /** Parallel to items. */
  itemConfidence: FieldConfidence[];
  /** Mean word confidence of the best reading, 0-100. */
  readingConfidence: number;
  /** The reading the items came from, whose text is stored as the OCR text. */
  bestText: string;
  bestSource: string;
};

/** Below this a reading is too poor for any field from it to count as confident. */
const MIN_CONFIDENT_READING = 55;
/** Component matches at or above this are candidates for high confidence. */
const HIGH_COMPONENT_SCORE = 0.9;

type Parsed = { reading: Reading; parse: ScannedInwardDc; weight: number };

function vote(
  parsed: Parsed[],
  valueOf: (p: ScannedInwardDc) => string | null,
  keyOf: (value: string) => string
): { value: string | null; confidence: FieldConfidence } {
  type Group = {
    weight: number;
    count: number;
    bestReading: number;
    spellings: Map<string, number>;
  };
  const groups = new Map<string, Group>();
  let producing = 0;
  for (const p of parsed) {
    const value = valueOf(p.parse);
    if (!value) continue;
    producing += p.weight;
    const key = keyOf(value);
    const group: Group = groups.get(key) ?? {
      weight: 0,
      count: 0,
      bestReading: 0,
      spellings: new Map<string, number>(),
    };
    group.weight += p.weight;
    group.count += 1;
    group.bestReading = Math.max(group.bestReading, p.reading.confidence);
    group.spellings.set(value, (group.spellings.get(value) ?? 0) + p.weight);
    groups.set(key, group);
  }
  let winner: Group | null = null;
  for (const group of groups.values()) if (!winner || group.weight > winner.weight) winner = group;
  if (!winner) return { value: null, confidence: "verify" };

  const value = [...winner.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const share = producing > 0 ? winner.weight / producing : 0;
  const agreed = parsed.length === 1 ? winner.bestReading >= 85 : winner.count >= 2 && share >= 0.6;
  return {
    value,
    confidence: agreed && winner.bestReading >= MIN_CONFIDENT_READING ? "high" : "verify",
  };
}

const itemKey = (item: { component: string; received_qty: number }) =>
  `${item.component}|${Math.round(item.received_qty * 1000)}`;

function itemsScore(p: Parsed): number {
  const matched = p.parse.items.reduce((sum, item) => sum + item.confidence, 0);
  // Rows OCR saw but could not match still show the table was read.
  return (matched + p.parse.newComponents.length * 0.3) * (0.5 + p.weight);
}

export function combineReadings(readings: Reading[], options: ParseInwardDcOptions): CombinedScan {
  const parsed: Parsed[] = readings
    .filter((r) => r.text.trim())
    .map((reading) => ({
      reading,
      parse: parseInwardDc(reading.text, options),
      weight: Math.max(0.05, reading.confidence / 100),
    }));

  if (parsed.length === 0) {
    return {
      customerId: null,
      customerName: null,
      customerDcNumber: null,
      customerDcDate: null,
      items: [],
      unmatchedLines: [],
      newComponents: [],
      fieldConfidence: {
        customerId: "verify",
        customerDcNumber: "verify",
        customerDcDate: "verify",
      },
      itemConfidence: [],
      readingConfidence: 0,
      bestText: readings[0]?.text ?? "",
      bestSource: readings[0]?.source ?? "",
    };
  }

  const customer = vote(
    parsed,
    (p) => p.customerId,
    (v) => v
  );
  const dcNumber = vote(
    parsed,
    (p) => p.customerDcNumber,
    (v) => foldOcrConfusables(v).replace(/\s+/g, "")
  );
  const date = vote(
    parsed,
    (p) => p.customerDcDate,
    (v) => v
  );

  const best = [...parsed].sort((a, b) => itemsScore(b) - itemsScore(a))[0];
  const items: ScannedInwardItem[] = [...best.parse.items];

  // Parts other readings found that the best one missed.
  const present = new Set(items.map((i) => i.component));
  const others = new Map<string, { item: ScannedInwardItem; count: number }>();
  for (const p of parsed) {
    if (p === best) continue;
    for (const item of p.parse.items) {
      if (present.has(item.component) || item.confidence < HIGH_COMPONENT_SCORE) continue;
      const key = itemKey(item);
      const entry = others.get(key) ?? { item, count: 0 };
      entry.count += 1;
      others.set(key, entry);
    }
  }
  // Added even when only one other reading saw it: a row silently missing is
  // worse than a row to confirm. One sighting is marked for checking below.
  for (const { item } of [...others.values()].sort((x, y) => y.count - x.count)) {
    if (!items.some((i) => i.component === item.component)) items.push(item);
  }

  // Quantities are voted on across readings: one misread digit (250 read as
  // 2650) in the best reading is outvoted by the others.
  for (const [index, item] of items.entries()) {
    const tally = new Map<number, number>();
    for (const p of parsed) {
      for (const other of p.parse.items) {
        if (other.component !== item.component || other.received_qty <= 0) continue;
        tally.set(other.received_qty, (tally.get(other.received_qty) ?? 0) + p.weight);
      }
    }
    const [winner] = [...tally.entries()].sort((x, y) => y[1] - x[1]);
    if (
      winner &&
      winner[0] !== item.received_qty &&
      winner[1] > (tally.get(item.received_qty) ?? 0)
    ) {
      items[index] = { ...item, received_qty: winner[0] };
    }
  }

  const itemConfidence: FieldConfidence[] = items.map((item) => {
    const agreeing = parsed.filter((p) =>
      p.parse.items.some((other) => itemKey(other) === itemKey(item))
    ).length;
    return item.confidence >= HIGH_COMPONENT_SCORE &&
      item.received_qty > 0 &&
      agreeing >= Math.min(2, parsed.length) &&
      best.reading.confidence >= MIN_CONFIDENT_READING
      ? "high"
      : "verify";
  });

  const customerName = customer.value
    ? (options.customers.find((c) => c.id === customer.value)?.name ?? null)
    : null;

  return {
    customerId: customer.value,
    customerName,
    customerDcNumber: dcNumber.value,
    customerDcDate: date.value,
    items,
    unmatchedLines: best.parse.unmatchedLines,
    newComponents: best.parse.newComponents,
    fieldConfidence: {
      customerId: customer.confidence,
      customerDcNumber: dcNumber.confidence,
      customerDcDate: date.confidence,
    },
    itemConfidence,
    readingConfidence: Math.round(best.reading.confidence),
    bestText: best.reading.text,
    bestSource: best.reading.source,
  };
}

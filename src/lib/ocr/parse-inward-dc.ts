// Turns the raw text Tesseract reads off a photographed inward delivery
// challan into the fields the DC form actually needs.
//
// Tesseract returns a flat block of text with no table structure, so nothing
// here can be trusted blindly — every value is surfaced for the operator to
// confirm before it touches the form. The goal is to save typing, not to be
// authoritative.

export type ScannedInwardItem = {
  component: string;
  material: string | null;
  received_qty: number;
  /** 0-1, how well the line matched a known component. Shown in the review UI. */
  confidence: number;
  rawLine: string;
};

export type ScannedInwardDc = {
  customerId: string | null;
  customerName: string | null;
  customerDcNumber: string | null;
  /** ISO yyyy-mm-dd, or null when no date could be read. */
  customerDcDate: string | null;
  items: ScannedInwardItem[];
  /**
   * Lines that carry a quantity but yielded no readable description at all, so
   * they became neither an item nor a new component name. Surfaced so a dropped
   * row is visible instead of silently missing.
   */
  unmatchedLines: string[];
  /**
   * Descriptions read off the challan that the component list does not hold
   * yet, cleaned of row numbers and quantity columns so they can be stored as
   * component names without a trip to Settings.
   */
  newComponents: ScannedNewComponent[];
};

/** A description found on the challan but absent from the component list. */
export type ScannedNewComponent = {
  name: string;
  material: string | null;
  received_qty: number;
  rawLine: string;
};

export type ParseInwardDcOptions = {
  customers: { id: string; name: string }[];
  components: string[];
  materials: string[];
};

/** Lowercase, drop punctuation, collapse runs of whitespace. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

export type CandidateMatch = { value: string; score: number };

function digitRuns(value: string): string[] {
  return value.match(/\d+/g) ?? [];
}

/**
 * True when every digit run of the candidate appears, in order, in the window.
 *
 * Part numbers differ precisely in their digits while sharing a lot of
 * boilerplate, so plain edit distance rates "3P DN40FB/50RB CF8M Body Casting"
 * and "3P-DN15FB/20RB CF8M Body Casting" as a 90% match. Recording the wrong
 * casting is far worse than failing to detect one, so a digit mismatch vetoes
 * the match outright and the operator adds that row by hand.
 */
function digitsAgree(candidate: string, window: string): boolean {
  const wanted = digitRuns(candidate);
  if (wanted.length === 0) return true;

  const found = digitRuns(window);
  let at = 0;
  for (const run of wanted) {
    at = found.indexOf(run, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}

/**
 * Look for any of `candidates` inside `haystack`. An exact substring wins
 * outright; otherwise every same-length window of words is scored so that
 * OCR slips ("SHAFI" for "SHAFT") still match.
 */
export function findCandidate(
  haystack: string,
  candidates: string[],
  threshold = 0.68
): CandidateMatch | null {
  const text = normalize(haystack);
  if (!text) return null;
  const words = text.split(" ");

  let best: CandidateMatch | null = null;

  for (const candidate of candidates) {
    const target = normalize(candidate);
    if (!target) continue;

    let score: number;
    if (text.includes(target)) {
      score = 1;
    } else {
      const span = target.split(" ").length;
      score = 0;
      for (let i = 0; i + span <= words.length; i += 1) {
        const window = words.slice(i, i + span).join(" ");
        if (!digitsAgree(target, window)) continue;
        score = Math.max(score, similarity(window, target));
      }
      // Short candidates fuzzy-match far too eagerly; require a near-exact hit.
      if (target.length <= 4 && score < 0.9) score = 0;
    }

    if (score >= threshold && (!best || score > best.score)) {
      best = { value: candidate, score };
    }
  }

  return best;
}

/** Undo the character swaps Tesseract makes most often in numeric fields. */
function fixDigits(value: string): string {
  return value
    .replace(/[OoQ]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8");
}

function cleanValue(value: string): string | null {
  const trimmed = value
    .replace(/^[\s:.\-#]+/, "")
    .replace(/[\s:.\-]+$/, "")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Find the value that follows a label. Patterns are tried in order, so a
 * strict pattern gets first refusal before a looser fallback runs. Falls back
 * to the next line when the label sits on its own row, which is common on
 * boxed challan forms.
 */
function findLabelled(lines: string[], labels: RegExp[]): string | null {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(label);
      if (!match) continue;

      const inline = cleanValue(match[1] ?? "");
      if (inline) return inline;

      const next = cleanValue(lines[i + 1] ?? "");
      if (next) return next;
    }
  }
  return null;
}

const DATE_PATTERN = /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b/;

/** Reads a dd/mm/yy(yy) date — the Indian convention on these forms. */
export function parseIndianDate(value: string): string | null {
  const match = fixDigits(value).match(DATE_PATTERN);
  if (!match) return null;

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100) return null;

  // Guard against an mm/dd/yyyy scan, but only swap when it is unambiguous.
  if (month > 12 && day <= 12) {
    const swap = day;
    day = month;
    month = swap;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDate(lines: string[]): string | null {
  // A line that says "date" is the best evidence; otherwise take the first
  // date-shaped thing on the page.
  for (const line of lines) {
    if (/date/i.test(line)) {
      const iso = parseIndianDate(line);
      if (iso) return iso;
    }
  }
  for (const line of lines) {
    const iso = parseIndianDate(line);
    if (iso) return iso;
  }
  return null;
}

// "DC" also sits inside ordinary words ("SIDCO"), so the label must be on a
// word boundary AND be followed by either an explicit "No"/"#" or, in the
// looser pass, a separator at the very start of the line.
const DC_NUMBER_LABELS = [
  /\b(?:d\.?\s*c\.?|delivery\s*ch[ae]l+an|ch[ae]l+an|invoice)\s*(?:no\.?|number|num|#)\s*[:.\-]?\s*(.*)$/i,
  /^(?:d\.?\s*c\.?|delivery\s*ch[ae]l+an|ch[ae]l+an|invoice)\s*[:.\-]\s*(.*)$/i,
];

/** Keep the first reference-looking token, dropping trailing prose. */
function firstReferenceToken(value: string): string | null {
  const match = value.match(/[A-Za-z0-9][A-Za-z0-9/\-_]*/);
  return match ? match[0] : null;
}

const HEADER_WORDS = [
  "description",
  "particulars",
  "quantity",
  "qty",
  "sl no",
  "s no",
  "unit",
  "rate",
  "amount",
  "total",
];

function isHeaderLine(line: string): boolean {
  const text = normalize(line);
  if (!text) return true;
  // Two or more column headings on one line: it's the table header, not a row.
  return HEADER_WORDS.filter((word) => text.includes(word)).length >= 2;
}

/** Quantity units seen on challans. "EA" (each) is common on printed ones. */
const QUANTITY_UNITS = "nos?|pcs?|pieces?|ea|kgs?|mtrs?|units?|sets?";
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const UNITED_QUANTITY = new RegExp(`(${NUMBER})\\s*(?:${QUANTITY_UNITS})\\b`, "i");
const DIMENSION_UNITS = /\b(mm|cm|mtr|inch|dia)\b/gi;

function toNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A row number at the head of a printed line: "1", "01.", "2)". */
const LEADING_SERIAL = /^\s*\d{1,3}\s*[).:\-]?\s+/;

/**
 * Normalise away the characters Tesseract swaps most often, for comparing two
 * spellings of the same part name.
 *
 * Both sides are folded the same way, so equal names stay equal; what it buys
 * is that "DN8ORB" read off the paper still equals the stored "DN80RB". The
 * digit-exactness veto in findCandidate deliberately rejects that pair, which
 * is right for picking a part but would otherwise let a misread spelling enter
 * the component list as a second, wrong entry.
 */
export function foldOcrConfusables(value: string): string {
  return normalize(value)
    .replace(/[oq]/g, "0")
    .replace(/[il|]/g, "1")
    .replace(/s/g, "5")
    .replace(/b/g, "8");
}

/** The stored spelling of a name that differs only by confusable characters. */
export function matchStoredName(name: string, known: string[]): string | null {
  const target = foldOcrConfusables(name);
  if (!target) return null;
  return known.find((candidate) => foldOcrConfusables(candidate) === target) ?? null;
}

/**
 * Turn a challan line into a component name the picklist could hold.
 *
 * The raw line carries the row number and the quantity columns as well as the
 * description — storing it whole would put "1 ... 250.000EA" in the dropdown.
 * The description is what sits between the two, so the line is cut at the first
 * quantity and the serial number trimmed off the front.
 *
 * Returns null when what remains is too short or has no letters, which is the
 * usual shape of an OCR misread rather than a real part.
 */
function describeUnmatchedLine(line: string, materials: string[]): ScannedNewComponent | null {
  const united = line.match(UNITED_QUANTITY);
  if (!united) return null;

  const name = line
    .slice(0, line.indexOf(united[0]))
    .replace(LEADING_SERIAL, "")
    .replace(/[\s.,;:|\-]+$/, "")
    .trim();

  if (name.length < 4 || !/[A-Za-z]/.test(name)) return null;

  // The grade is usually printed inside the part name, so read it from there.
  const material = findCandidate(name, materials);
  return {
    name,
    material: material?.value ?? null,
    received_qty: toNumber(united[1]),
    rawLine: line,
  };
}

/**
 * Pull the received quantity off a table row.
 *
 * Printed challans usually put a value or rate column after the quantity, so
 * "last number on the line" is wrong — a row ending "200.000EA   0.00" means
 * 200, not nothing. A number carrying a unit is therefore taken as the
 * quantity outright, and the last-number rule only applies when no unit is
 * printed at all.
 */
function extractQuantity(line: string, consumed: string[]): number {
  let rest = line;
  for (const phrase of consumed) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    rest = rest.replace(pattern, " ");
  }

  const united = rest.match(UNITED_QUANTITY);
  if (united) return toNumber(united[1]);

  // No unit printed: drop dimensions so "25 MM DIA 10" doesn't read as 25.
  rest = rest.replace(DIMENSION_UNITS, " ");
  const numbers = rest.match(new RegExp(NUMBER, "g"));
  if (!numbers || numbers.length === 0) return 0;

  return toNumber(numbers[numbers.length - 1]);
}

export function parseInwardDc(text: string, options: ParseInwardDcOptions): ScannedInwardDc {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const customerNames = options.customers.map((c) => c.name);
  let customerMatch: CandidateMatch | null = null;
  for (const line of lines) {
    const match = findCandidate(line, customerNames, 0.72);
    if (match && (!customerMatch || match.score > customerMatch.score)) {
      customerMatch = match;
    }
  }
  const customer = customerMatch
    ? (options.customers.find((c) => c.name === customerMatch?.value) ?? null)
    : null;

  const dcNumberRaw = findLabelled(lines, DC_NUMBER_LABELS);

  const items: ScannedInwardItem[] = [];
  const unmatchedLines: string[] = [];
  const newComponents: ScannedNewComponent[] = [];
  const seenNewNames = new Set<string>();
  for (const line of lines) {
    if (isHeaderLine(line)) continue;

    const component = findCandidate(line, options.components);
    if (!component) {
      // A quantity with no recognised component means we are about to drop a
      // real row; keep it so the review step can say so.
      if (UNITED_QUANTITY.test(line) && !/\btotal\b/i.test(line)) {
        const candidate = describeUnmatchedLine(line, options.materials);
        if (!candidate) {
          // Nothing usable between the row number and the quantity.
          unmatchedLines.push(line);
        } else {
          // A part already listed but misread — an O for a zero is enough to
          // get here — is the same part, so it takes the stored spelling
          // rather than being offered as a new one.
          const stored = matchStoredName(candidate.name, options.components);
          if (stored) {
            items.push({
              component: stored,
              material: candidate.material,
              received_qty: candidate.received_qty,
              confidence: 0.85,
              rawLine: line,
            });
          } else if (!seenNewNames.has(foldOcrConfusables(candidate.name))) {
            // Offer it as a component the list does not have yet, so a part
            // new to this workshop need not be typed into Settings first.
            seenNewNames.add(foldOcrConfusables(candidate.name));
            newComponents.push(candidate);
          }
        }
      }
      continue;
    }

    const material = findCandidate(line, options.materials);
    const consumed = [component.value];
    if (material) consumed.push(material.value);

    items.push({
      component: component.value,
      material: material?.value ?? null,
      received_qty: extractQuantity(line, consumed),
      confidence: component.score,
      rawLine: line,
    });
  }

  return {
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    customerDcNumber: dcNumberRaw ? firstReferenceToken(dcNumberRaw) : null,
    customerDcDate: extractDate(lines),
    items,
    unmatchedLines,
    newComponents,
  };
}

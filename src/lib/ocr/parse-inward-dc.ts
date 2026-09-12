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
 *
 * `accept` filters both candidates, and the next-line fallback is why it
 * exists: on a boxed form Tesseract reads the header cells as a column, so the
 * line after "D.C. No." is very often the neighbouring cell's own caption
 * rather than a value. With no test of what the field should look like, "Date"
 * was read as the customer's DC number and stored as one.
 */
/** How far below a label its value may sit on a column-read boxed form. */
const LABEL_LOOKAHEAD = 3;

function findLabelled(
  lines: string[],
  labels: RegExp[],
  accept: (value: string) => boolean = () => true
): string | null {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(label);
      if (!match) continue;

      const inline = cleanValue(match[1] ?? "");
      if (inline && accept(inline)) return inline;

      // Scans a short way down rather than only the next line. Tesseract
      // reads these boxed headers as a column of captions followed by a column
      // of values, so the number can be two or three lines below its label.
      for (let ahead = 1; ahead <= LABEL_LOOKAHEAD; ahead += 1) {
        const next = cleanValue(lines[i + ahead] ?? "");
        if (next && accept(next)) return next;
      }
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

/**
 * Captions printed in the boxes around the DC number. Taken for a value they
 * produce a challan whose customer reference is the word "Date".
 */
const FIELD_CAPTIONS =
  /^(?:date|dated|d\.?\s*c\.?|delivery|challan|ch[ae]l+an|invoice|no|number|num|ref|reference|party|customer|supplier|to|from|gst|gstin|address|page)\b/i;

/**
 * Whether a value can be a document reference.
 *
 * Every DC and invoice number these customers issue carries a digit and a
 * caption never does, so this single test rejects both a stray caption and the
 * prose that trails a field.
 */
function looksLikeReference(value: string): boolean {
  if (!/\d/.test(value)) return false;
  return !FIELD_CAPTIONS.test(value.trim());
}

/** Keep the first reference-looking token, dropping trailing prose. */
function firstReferenceToken(value: string): string | null {
  // Every token is tried, not only the first: a form printing "No. 1234"
  // inside one cell would otherwise yield "No".
  for (const token of value.match(/[A-Za-z0-9][A-Za-z0-9/\-_]*/g) ?? []) {
    if (looksLikeReference(token)) return token;
  }
  return null;
}

const HEADER_WORDS = [
  "description",
  "particulars",
  "quantity",
  "qty",
  // "Sl No." comes back as "SI No." — Tesseract reads a lowercase L as a
  // capital I constantly — so both spellings have to be listed.
  "sl no",
  "si no",
  "s no",
  "product",
  "hsn",
  "assessable",
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
/** Longest a printed part name runs. The terms under the table run longer. */
const MAX_DESCRIPTION_WORDS = 12;

const QUANTITY_UNITS = "nos?|pcs?|pieces?|ea|kgs?|mtrs?|units?|sets?";
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const UNITED_QUANTITY = new RegExp(`(${NUMBER})\\s*(?:${QUANTITY_UNITS})\\b`, "i");
const DIMENSION_UNITS = /\b(mm|cm|mtr|inch|dia)\b/gi;

function toNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The ruled edge of a table cell, which Tesseract returns as a stray glyph at
 * the head of the line.
 *
 * Left in place it becomes part of the part name: the component list ended up
 * holding "| 3P DN40FB/50RB CF8M Body Casting REV 2", which no longer matched
 * the same part read cleanly, so the same casting sat in the list twice.
 */
const LEADING_BORDER = /^[\s|![\]{}()<>*_=+~'"`.,;:\-]+/;

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

/**
 * Whether two printed names describe the same part.
 *
 * Edit distance across a whole name is far too forgiving for these, which share
 * most of their words and differ in one: "CF8M Bonnet Casting REV 2" scored 90%
 * against "CF8M Body Casting REV 2", and anything ending "Body ISO 2" matched
 * "Body ISO" outright because one contains the other. Both recorded the wrong
 * casting silently, which is worse than failing to recognise it.
 *
 * So every word must find its own partner on the other side, and no word may be
 * left over. Comparing folded words keeps OCR slips together — "DN8ORB" still
 * pairs with "DN80RB" — while a different or extra word separates them. Erring
 * towards "not the same part" is deliberate: an unrecognised description is
 * shown to the operator, who can correct it, whereas a wrong match is silent.
 */
function partsAgree(a: string, b: string): boolean {
  const left = foldOcrConfusables(a).split(" ").filter(Boolean);
  const right = foldOcrConfusables(b).split(" ").filter(Boolean);
  if (left.length === 0 || right.length === 0) return false;

  const taken = new Array(right.length).fill(false);
  for (const word of left) {
    let bestAt = -1;
    let bestScore = 0;
    for (let i = 0; i < right.length; i += 1) {
      if (taken[i]) continue;
      const score = similarity(word, right[i]);
      if (score > bestScore) {
        bestScore = score;
        bestAt = i;
      }
    }
    if (bestAt === -1 || bestScore < 0.8) return false;
    taken[bestAt] = true;
  }
  // Every word on the other side must have been claimed as well, so a listed
  // name that is merely a prefix of what was printed is not a match.
  return taken.every(Boolean);
}

/**
 * Whether two stored names look like the same part under different spellings.
 *
 * Used to find duplicates that OCR has already put in the list, so one can be
 * merged away. Deliberately looser than the match used while reading a challan:
 * here a false positive only offers a suggestion the operator can decline,
 * whereas a missed duplicate sits in the dropdown forever.
 */
export function namesLookAlike(a: string, b: string): boolean {
  const left = foldOcrConfusables(a);
  const right = foldOcrConfusables(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // Word by word, which is what partsAgree does. Comparing whole names by edit
  // distance was tried and rejected: it rated "DN25FB/32RB ... Body Casting"
  // against "DN40FB/50RB ... Body Casting" at 89%, and "Body Casting" against
  // "Bonnet Casting" higher still, offering real parts up as duplicates. Per
  // word is strict enough to keep those apart while still pairing a dropped
  // letter, "Casing" with "Casting", inside one word.
  return partsAgree(a, b);
}

/**
 * The component a printed description names, or null when it names none.
 *
 * findCandidate does the fuzzy search; partsAgree then vetoes a match whose
 * words do not actually line up with the description.
 */
function matchComponent(description: string, components: string[]): CandidateMatch | null {
  const found = findCandidate(description, components);
  if (!found) return null;
  return partsAgree(description, found.value) ? found : null;
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
/**
 * Whether a line reads like a part description rather than a field or an
 * address.
 *
 * The row number is often lost — the narrow "Sl No." column reads as nothing at
 * all — so a row cannot be recognised by the number it opens with, and a part
 * new to the list matches no component either. What these names always have is
 * ordinary words alongside a code: "Body Casting" next to "DN25FB/32RB". A
 * reference like "ODC26-27/1062" carries no such words, and a street address
 * carries no digits.
 */
function looksLikePartDescription(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  const spelled = words.filter((word) => /^[A-Za-z]{3,}$/.test(word)).length;
  if (spelled < 2 || !/\d/.test(text)) return false;

  // A part number always has at least one token mixing letters and digits:
  // "3P", "DN40FB", "CF8M". The printed terms below the table never do, and
  // without this test they passed every check above and were offered as new
  // components — "per LT V norms 10% of Inspection Report need to be..." was
  // one row away from joining the master list.
  const coded = words.some(
    (word) => /[A-Za-z]/.test(word) && /\d/.test(word) && /^[A-Za-z0-9/#.\-]+$/.test(word)
  );
  if (!coded) return false;

  // Terms run on; part names do not. A cap catches anything the token test
  // lets through, such as a clause that happens to quote a part number.
  return words.length <= MAX_DESCRIPTION_WORDS;
}

/**
 * A scanned description reduced to a storable part name, or null when what was
 * read is not one.
 *
 * The component list is a master list of roughly a dozen real castings, so a
 * name that cannot be typed by hand has no business being added by a scan.
 * This is the last gate before one is stored: the review screen can be clicked
 * through, and once a misread name is in the list it silently becomes a second
 * entry for a part that is already there.
 */
export function cleanComponentName(value: string): string | null {
  const name = stripTrailingColumns(
    (value ?? "")
      .replace(LEADING_BORDER, "")
      .replace(LEADING_SERIAL, "")
      .replace(LEADING_BORDER, "")
      .replace(/[\s.,;:|\-]+$/, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (name.length < 4 || name.length > 120) return null;
  // Same shape test the parser uses to tell a part row from a stray line.
  if (!looksLikePartDescription(name)) return null;
  return name;
}

/**
 * Remove the neighbouring columns that OCR runs onto the end of a description.
 *
 * A table row reaches us as one line, so the Product Description cell arrives
 * with whatever sat beside it: an HSN code, a quantity, a unit. Those were
 * ending up inside the stored part name, which then matched nothing and
 * became a second entry for a casting already on the list.
 *
 * Deliberately conservative about bare integers. Real part names end in one —
 * "Body Casting REV 2" — so only things a part name cannot end with are cut:
 * a quantity carrying a unit, a number with decimals, or a six-to-eight digit
 * code. Repeated until nothing more comes off, since a row often trails two of
 * them at once.
 */
function stripTrailingColumns(text: string): string {
  let name = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const before = name;
    // Everything from a unit-qualified quantity onwards is another column.
    const united = name.match(UNITED_QUANTITY);
    if (united && united.index !== undefined && united.index > 0) {
      name = name.slice(0, united.index);
    }
    name = name
      // A trailing decimal: "200.000", "50.5". No part number ends this way.
      .replace(/\s\d[\d,]*\.\d+\s*$/, "")
      // A trailing HSN or tariff code. Too long to be a revision number.
      .replace(/\s\d{6,8}\s*$/, "")
      .replace(/[\s.,;:|\-]+$/, "")
      .trim();
    if (name === before) break;
  }
  return name;
}

/** Trim a printed description down to the part name alone. */
function descriptionFrom(text: string): string | null {
  // Border first, then the row number: the two arrive together as "| 1 3P …"
  // and stripping only the number leaves the border glued to the name.
  const name = stripTrailingColumns(
    text
      .replace(LEADING_BORDER, "")
      .replace(LEADING_SERIAL, "")
      .replace(LEADING_BORDER, "")
      .replace(/[\s.,;:|\-]+$/, "")
      .trim()
  );
  if (name.length < 4 || !/[A-Za-z]/.test(name)) return null;
  return name;
}

/**
 * The quantity from a line that carries nothing else.
 *
 * Tesseract often splits a decimal point off from its digits, so "204.000EA"
 * comes back as "204. 000EA" and a plain match reads it as zero. Closing that
 * gap first recovers the real figure.
 */
function parseBareQuantity(line: string): number {
  // The decimal point is routinely lost or spaced out, so "284.000EA" arrives
  // as "284 000EA" or "204. 000EA" and a plain match reads only the "000".
  // Rejoining the digits first recovers the figure. Safe here because the line
  // carries nothing but the quantity column.
  const joined = line.replace(/(\d)[\s.,]+(\d)/g, "$1.$2");
  const united = joined.match(UNITED_QUANTITY);
  return united ? toNumber(united[1]) : 0;
}

function describeUnmatchedLine(line: string, materials: string[]): ScannedNewComponent | null {
  const united = line.match(UNITED_QUANTITY);
  if (!united) return null;

  const name = descriptionFrom(line.slice(0, line.indexOf(united[0])));
  if (!name) return null;

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

  const dcNumberRaw = findLabelled(lines, DC_NUMBER_LABELS, looksLikeReference);

  const items: ScannedInwardItem[] = [];
  const unmatchedLines: string[] = [];
  const newComponents: ScannedNewComponent[] = [];
  const seenNewNames = new Set<string>();
  /**
   * A description still waiting for its quantity.
   *
   * On a boxed challan Tesseract reads the description column and the quantity
   * column as separate lines, so a row arrives as "3P DN50RB ... Casting" and
   * then "200.000EA" on its own. Holding the description until a quantity turns
   * up keeps those rows instead of discarding both halves.
   */
  /**
   * The table's two columns, collected separately and paired by position.
   *
   * Tesseract reads a boxed challan column by column, not row by row: every
   * description comes through as one block and every quantity as another, with
   * the DC number and date in between. Nothing can be paired by adjacency, so
   * the first description takes the first quantity and so on.
   */
  const rowDescriptions: { line: string; description: string; component: CandidateMatch | null }[] =
    [];
  const rowQuantities: { value: number; line: string }[] = [];

  /**
   * Files one row: as a known component, as a listed one under a misread
   * spelling, or as a description the list does not hold yet.
   */
  function record(
    description: string,
    component: CandidateMatch | null,
    material: string | null,
    qty: number,
    raw: string
  ) {
    if (component) {
      items.push({
        component: component.value,
        material,
        received_qty: qty,
        confidence: component.score,
        rawLine: raw,
      });
      return;
    }
    // A part already listed but misread — an O for a zero is enough — is the
    // same part, so it takes the stored spelling.
    const stored = matchStoredName(description, options.components);
    if (stored) {
      items.push({
        component: stored,
        material,
        received_qty: qty,
        confidence: 0.85,
        rawLine: raw,
      });
      return;
    }
    // Offer it as a component the list does not have yet, so a part new to
    // this workshop need not be typed into Settings first.
    if (!seenNewNames.has(foldOcrConfusables(description))) {
      seenNewNames.add(foldOcrConfusables(description));
      newComponents.push({ name: description, material, received_qty: qty, rawLine: raw });
    }
  }

  /**
   * Whether the item table has started. The letterhead above it is full of
   * lines that read like descriptions — an address, a GST number — and they
   * must not be taken for rows.
   */
  let inTable = false;

  for (const line of lines) {
    if (isHeaderLine(line)) {
      inTable = true;
      continue;
    }

    const isTotal = /\btotal\b/i.test(line);
    const hasQuantity = UNITED_QUANTITY.test(line) && !isTotal;
    const inline = hasQuantity ? describeUnmatchedLine(line, options.materials) : null;
    const description = hasQuantity ? (inline?.name ?? null) : descriptionFrom(line);
    const component = description ? matchComponent(description, options.components) : null;

    // Description and quantity printed together: a complete row already.
    if (inline && description) {
      record(description, component, inline.material, inline.received_qty, line);
      continue;
    }

    // A quantity column entry, awaiting the description of the same rank.
    if (hasQuantity) {
      if (inTable) rowQuantities.push({ value: parseBareQuantity(line), line });
      else unmatchedLines.push(line);
      continue;
    }

    // A description column entry. A table row either names a known component
    // or opens with its row number; that keeps "DC No. ..." and "Total ..."
    // out of the column, which would otherwise shift every pairing by one.
    if (!description || !inTable || isTotal) continue;
    if (component || LEADING_SERIAL.test(line) || looksLikePartDescription(description)) {
      rowDescriptions.push({ line, description, component });
    }
  }

  // Pair the two columns by position.
  const rowCount = Math.max(rowDescriptions.length, rowQuantities.length);
  for (let i = 0; i < rowCount; i += 1) {
    const desc = rowDescriptions[i];
    const qty = rowQuantities[i];

    // A figure with no description of its own rank.
    if (!desc) {
      if (qty) unmatchedLines.push(qty.line);
      continue;
    }

    const material = findCandidate(desc.line, options.materials)?.value ?? null;
    const consumed = desc.component ? [desc.component.value] : [];
    if (material) consumed.push(material);
    // Read from the description, not the raw line: the row number at the head
    // would otherwise be taken for the quantity.
    const value = qty ? qty.value : extractQuantity(desc.description, consumed);
    const raw = qty ? `${desc.line}  ${qty.line}` : desc.line;
    record(desc.description, desc.component, material, value, raw);
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

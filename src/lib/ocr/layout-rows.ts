/**
 * Rebuilds a challan's table rows from where the words sit on the page.
 *
 * Tesseract's own text follows its layout analysis, which on a boxed challan
 * often reads a whole column before the next: every description, then every
 * quantity. Pairing those back by order breaks as soon as one line is missed.
 * Grouping words by their vertical position puts each description back on the
 * same line as its own quantity, whatever order they were read in.
 */

export type OcrWord = {
  text: string;
  /** 0-100, as Tesseract reports it. */
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Words grouped into visual lines, top to bottom, each line left to right.
 * A wide horizontal gap (a table column boundary) becomes three spaces, which
 * the challan parser already treats as a column break.
 */
export function wordsToRowText(words: OcrWord[], minConfidence = 0): string {
  const usable = words.filter(
    (w) => w.text.trim() && w.confidence >= minConfidence && w.bbox.y1 > w.bbox.y0
  );
  if (usable.length === 0) return "";

  const height = median(usable.map((w) => w.bbox.y1 - w.bbox.y0)) || 1;
  const charWidth =
    median(usable.map((w) => (w.bbox.x1 - w.bbox.x0) / Math.max(1, w.text.trim().length))) || 1;

  const sorted = [...usable].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2
  );
  const rows: { centre: number; words: OcrWord[] }[] = [];
  for (const word of sorted) {
    const centre = (word.bbox.y0 + word.bbox.y1) / 2;
    const row = rows.at(-1);
    if (row && Math.abs(centre - row.centre) <= height * 0.55) {
      row.words.push(word);
      row.centre = (row.centre * (row.words.length - 1) + centre) / row.words.length;
    } else {
      rows.push({ centre, words: [word] });
    }
  }

  return rows
    .map((row) => {
      const inOrder = row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      let line = "";
      let previous: OcrWord | null = null;
      for (const word of inOrder) {
        if (previous) {
          const gap = word.bbox.x0 - previous.bbox.x1;
          line += gap > charWidth * 3 ? "   " : " ";
        }
        line += word.text.trim();
        previous = word;
      }
      return line;
    })
    .join("\n");
}

/** Mean confidence of the words, 0-100, or 0 when there are none. */
export function meanConfidence(words: OcrWord[]): number {
  const usable = words.filter((w) => w.text.trim());
  if (usable.length === 0) return 0;
  return usable.reduce((sum, w) => sum + w.confidence, 0) / usable.length;
}

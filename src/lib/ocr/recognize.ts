// Browser-side OCR for the inward-challan scanner.
//
// Tesseract runs entirely on the device, so the photo never leaves the phone.
// The trade-off is that it is sensitive to image quality, hence the
// preprocessing pass below — a flat, high-contrast greyscale image reads far
// better than a raw phone snapshot.

/** Longest edge, in px, we hand to Tesseract. Roughly 300 DPI for an A4 page. */
const TARGET_LONG_EDGE = 2000;
const MIN_LONG_EDGE = 1200;

export type OcrProgress = { status: string; progress: number };

/**
 * What the photograph itself was like, before any reading was attempted.
 *
 * OCR fails silently on a poor picture: it returns confident-looking nonsense
 * rather than an error, and the operator has no way to tell a bad photo from a
 * bad parser. Measuring the input means the dialog can say "retake this" while
 * the challan is still in front of them.
 */
export type ImageQuality = {
  /** Longest edge of the original file, in px. */
  longEdge: number;
  /** Too few pixels across the page for the table text to survive. */
  tooSmall: boolean;
};

export type PreparedImage = {
  canvas: HTMLCanvasElement;
  /** data: URL for the review thumbnail. */
  previewUrl: string;
  quality: ImageQuality;
};

/** Below this the page simply has too few pixels for the table to be read. */
const MIN_USABLE_LONG_EDGE = 1500;

/**
 * Narrowest percentile span worth stretching. Below it the photograph is
 * already high-contrast and stretching would only destroy it.
 */
const MIN_STRETCHABLE_SPAN = 32;

/**
 * Downscale (or gently upscale) the photo, convert to greyscale, and stretch
 * the contrast so faint pen strokes separate from the paper.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale =
    longEdge > TARGET_LONG_EDGE
      ? TARGET_LONG_EDGE / longEdge
      : longEdge < MIN_LONG_EDGE
        ? MIN_LONG_EDGE / longEdge
        : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read the image on this device.");

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;

  // Pass 1: greyscale, building a luminance histogram as we go.
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const grey = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
    pixels[i] = grey;
    pixels[i + 1] = grey;
    pixels[i + 2] = grey;
    histogram[grey] += 1;
  }

  // Pass 2: linear stretch between the 2nd and 98th percentiles, which ignores
  // glare highlights and shadowed corners instead of letting them flatten the
  // rest of the page.
  const total = canvas.width * canvas.height;
  const low = percentile(histogram, total, 0.02);
  const high = percentile(histogram, total, 0.98);
  const span = high - low;

  // A sparse page is mostly paper: on a clean, evenly lit shot of this challan
  // fewer than 2% of pixels are ink, so both percentiles land on white and the
  // span collapses to nothing. Stretching by that mapped every pixel to black
  // and Tesseract read an empty rectangle. The stretch only helps when there is
  // a real spread to open up, so a collapsed one is left alone.
  if (span >= MIN_STRETCHABLE_SPAN) {
    for (let i = 0; i < pixels.length; i += 4) {
      const stretched = Math.min(255, Math.max(0, ((pixels[i] - low) * 255) / span)) | 0;
      pixels[i] = stretched;
      pixels[i + 1] = stretched;
      pixels[i + 2] = stretched;
    }
  }

  ctx.putImageData(image, 0, 0);

  return {
    canvas,
    previewUrl: canvas.toDataURL("image/jpeg", 0.7),
    quality: {
      longEdge,
      tooSmall: longEdge < MIN_USABLE_LONG_EDGE,
    },
  };
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return 255;
}

/**
 * Run Tesseract over a prepared image. The engine core and language data are
 * fetched from Tesseract's CDN on first use and then cached by the browser, so
 * the very first scan on a device needs a network connection.
 */
export async function recognizeText(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (message) => onProgress?.({ status: message.status, progress: message.progress }),
  });

  try {
    await worker.setParameters({
      // Full layout analysis: challans are boxed forms with a table, not one
      // uniform block of prose.
      tessedit_pageseg_mode: PSM.AUTO,
      // Keep column gaps in the output so each table row stays on one line.
      preserve_interword_spaces: "1",
    });

    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// Browser-side OCR for the inward-challan scanner.
//
// Everything runs on the device, so the photograph is only uploaded when the
// scan is kept. Preparation (straightening, shadow removal, thresholding)
// runs in a background worker and Tesseract in its own, so the page stays
// responsive. The same page is read from several prepared images and the
// readings are combined (see pipeline.ts and combine.ts).

import { readChallan, type ChallanReading, type ScanStage } from "@/lib/ocr/pipeline";
import {
  grayToRgba,
  rgbaToGray,
  prepareForOcr,
  type Gray,
  type OcrVariantName,
  type PreparedForOcr,
} from "@/lib/ocr/preprocess";
import type { OcrWord } from "@/lib/ocr/layout-rows";
import type { ParseInwardDcOptions } from "@/lib/ocr/parse-inward-dc";
import type { PrepareRequest, PrepareResponse } from "@/lib/ocr/prepare.worker";

export type { ScanStage };

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
  /** Measured as blurred after preparation. */
  blurred: boolean;
};

/** Below this the page simply has too few pixels for the table to be read. */
const MIN_USABLE_LONG_EDGE = 1500;
/** Larger photos are scaled down to this before anything else: detail beyond it adds time, not text. */
const MAX_WORKING_LONG_EDGE = 3000;

export type ScanProgress = { stage: ScanStage; pass?: number; passes?: number };

export type ChallanScan = {
  reading: ChallanReading;
  quality: ImageQuality;
  /** data: URL of the photograph, for the review thumbnail. */
  previewUrl: string;
  /** The prepared image the reading came from, as a JPEG, stored beside the original. */
  processedBlob: Blob | null;
};

async function loadGray(file: Blob): Promise<{ gray: Gray; longEdge: number; previewUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > MAX_WORKING_LONG_EDGE ? MAX_WORKING_LONG_EDGE / longEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not read the image on this device.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = rgbaToGray(pixels.data, canvas.width, canvas.height);

  const thumb = document.createElement("canvas");
  const thumbScale = Math.min(1, 900 / Math.max(canvas.width, canvas.height));
  thumb.width = Math.round(canvas.width * thumbScale);
  thumb.height = Math.round(canvas.height * thumbScale);
  thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return { gray, longEdge, previewUrl: thumb.toDataURL("image/jpeg", 0.7) };
}

/** Runs preparation in a worker, or on the page when workers are unavailable. */
function createPreparer(gray: Gray) {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  let nextId = 1;

  const prepare = (options: {
    thorough: boolean;
    quarterTurns: number;
  }): Promise<PreparedForOcr> => {
    if (!worker) return Promise.resolve(prepareForOcr(gray, options));
    const active = worker;
    const id = nextId++;
    // A copy each time: the buffer is transferred to the worker and gone from here.
    const data = gray.data.slice().buffer;
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<PrepareResponse>) => {
        if (event.data.id !== id) return;
        active.removeEventListener("message", onMessage);
        active.removeEventListener("error", onError);
        const response = event.data;
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve({
          report: response.report,
          variants: response.variants.map((v) => ({
            name: v.name as OcrVariantName,
            image: { width: v.width, height: v.height, data: new Uint8ClampedArray(v.data) },
          })),
        });
      };
      const onError = () => {
        active.removeEventListener("message", onMessage);
        active.removeEventListener("error", onError);
        // A worker that failed to load: do it here instead.
        worker?.terminate();
        worker = null;
        try {
          resolve(prepareForOcr(gray, options));
        } catch (error) {
          reject(error);
        }
      };
      active.addEventListener("message", onMessage);
      active.addEventListener("error", onError);
      const request: PrepareRequest = {
        id,
        width: gray.width,
        height: gray.height,
        data,
        thorough: options.thorough,
        quarterTurns: options.quarterTurns,
      };
      active.postMessage(request, [data]);
    });
  };
  return { prepare, dispose: () => worker?.terminate() };
}

function grayCanvas(image: Gray): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the image on this device.");
  const rgba = new Uint8ClampedArray(new ArrayBuffer(image.width * image.height * 4));
  rgba.set(grayToRgba(image));
  ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  return canvas;
}

/**
 * Reads one photographed customer challan.
 *
 * The engine core and language data are fetched from Tesseract's CDN on first
 * use and then cached by the browser, so the very first scan on a device
 * needs a network connection.
 */
export async function scanChallan(
  file: Blob,
  options: ParseInwardDcOptions & { thorough?: boolean },
  onProgress?: (progress: ScanProgress) => void
): Promise<ChallanScan> {
  onProgress?.({ stage: "improving" });
  const { gray, longEdge, previewUrl } = await loadGray(file);
  const preparer = createPreparer(gray);
  const { createWorker, PSM } = await import("tesseract.js");
  const tesseract = await createWorker("eng", 1);

  try {
    await tesseract.setParameters({
      // Full layout analysis: challans are boxed forms with a table, not one
      // uniform block of prose.
      tessedit_pageseg_mode: PSM.AUTO,
      // Keep column gaps in the output so each table row stays on one line.
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const reading = await readChallan(
      {
        prepare: preparer.prepare,
        recognize: async (image) => {
          const { data } = await tesseract.recognize(
            grayCanvas(image),
            {},
            { text: true, blocks: true }
          );
          const words: OcrWord[] = [];
          for (const block of data.blocks ?? []) {
            for (const paragraph of block.paragraphs) {
              for (const line of paragraph.lines) {
                for (const word of line.words) {
                  words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox });
                }
              }
            }
          }
          return { text: data.text, words };
        },
        onStage: (stage, detail) => onProgress?.({ stage, ...detail }),
      },
      options
    );

    const processedBlob = await new Promise<Blob | null>((resolve) =>
      grayCanvas(reading.processed).toBlob(resolve, "image/jpeg", 0.8)
    ).catch(() => null);

    return {
      reading,
      previewUrl,
      processedBlob,
      quality: {
        longEdge,
        tooSmall: longEdge < MIN_USABLE_LONG_EDGE,
        blurred: reading.report.blurred,
      },
    };
  } finally {
    preparer.dispose();
    await tesseract.terminate();
  }
}

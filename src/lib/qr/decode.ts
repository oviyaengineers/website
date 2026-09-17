/**
 * Reading QR codes in the browser.
 *
 * Two readers, used together:
 *
 *  - the browser's own BarcodeDetector where it exists (Android Chrome and
 *    other Chromium builds): fast, hardware-assisted, good with tilt;
 *  - ZXing compiled to WebAssembly everywhere, including iPhone Safari, which
 *    has no BarcodeDetector. It also backs the native reader up on frames the
 *    native one misses.
 *
 * The WebAssembly file is served from this site (public/vendor/zxing), not a
 * CDN, so scanning does not depend on a third party being reachable.
 */

export const ZXING_WASM_URL = "/vendor/zxing/zxing_reader-3.1.4.wasm";

type NativeDetector = {
  detect(source: CanvasImageSource | ImageBitmap | ImageData): Promise<{ rawValue: string }[]>;
};
type NativeDetectorConstructor = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** The browser's own QR detector, or null when there is none. */
export async function nativeQrDetector(): Promise<NativeDetector | null> {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorConstructor })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
    if (!formats.includes("qr_code")) return null;
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

type ZxingReader = (image: ImageData, thorough: boolean) => Promise<string[]>;

let zxingPromise: Promise<ZxingReader> | null = null;

/**
 * ZXing, loaded once. Starting this as the scanner opens means it is usually
 * ready by the time the camera shows its first frame.
 */
export function loadZxing(): Promise<ZxingReader> {
  if (!zxingPromise) {
    zxingPromise = (async () => {
      const zxing = await import("zxing-wasm/reader");
      await zxing.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path,
        },
        fireImmediately: true,
      });
      return async (image: ImageData, thorough: boolean) => {
        const results = await zxing.readBarcodesFromImageData(image, {
          formats: ["QRCode"],
          maxNumberOfSymbols: 1,
          // Every frame gets the full effort: tilted, small or unevenly lit
          // codes are exactly the ones worth the extra milliseconds.
          tryHarder: true,
          tryRotate: true,
          tryDownscale: true,
          // Inverted codes do not exist on our prints; only a still photo
          // gets that extra pass.
          tryInvert: thorough,
        });
        return results.filter((r) => r.isValid && r.text).map((r) => r.text);
      };
    })();
    zxingPromise.catch(() => {
      zxingPromise = null;
    });
  }
  return zxingPromise;
}

/** A scratch canvas that is reused, so frames do not allocate. */
export function scratchCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  return { canvas, ctx };
}

/**
 * Draws part of a source onto the canvas and returns its pixels.
 *
 * crop is the fraction of the shorter side to keep around the centre (1 for
 * the whole picture); maxEdge caps the longest edge handed to the reader.
 */
export function framePixels(
  target: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: number,
  maxEdge: number
): ImageData {
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (crop < 1) {
    const side = Math.round(Math.min(sourceWidth, sourceHeight) * crop);
    sx = Math.round((sourceWidth - side) / 2);
    sy = Math.round((sourceHeight - side) / 2);
    sw = side;
    sh = side;
  }
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  if (target.canvas.width !== width) target.canvas.width = width;
  if (target.canvas.height !== height) target.canvas.height = height;
  target.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  return target.ctx.getImageData(0, 0, width, height);
}

/**
 * Every QR text found in a still image (a photo chosen from the device),
 * trying the whole picture at a few sizes and the centre, with both readers.
 */
export async function readQrFromImage(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const target = scratchCanvas();
    const native = await nativeQrDetector();
    if (native) {
      try {
        const found = await native.detect(bitmap);
        if (found.length > 0) return found.map((f) => f.rawValue);
      } catch {
        // Fall through to ZXing.
      }
    }
    const read = await loadZxing();
    const attempts: [number, number][] = [
      [1, 1600],
      [1, 1000],
      [0.6, 1600],
      [1, 2600],
      [0.4, 1600],
    ];
    for (const [crop, maxEdge] of attempts) {
      const pixels = framePixels(target, bitmap, bitmap.width, bitmap.height, crop, maxEdge);
      const texts = await read(pixels, true);
      if (texts.length > 0) return texts;
    }
    return [];
  } finally {
    bitmap.close();
  }
}

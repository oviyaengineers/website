/**
 * Background worker for the image preparation, so straightening, flattening
 * and thresholding a 12-megapixel photo never freezes the page.
 */

import { prepareForOcr, type Gray } from "@/lib/ocr/preprocess";

export type PrepareRequest = {
  id: number;
  width: number;
  height: number;
  data: ArrayBuffer;
  thorough: boolean;
  quarterTurns: number;
};

export type PrepareResponse =
  | {
      id: number;
      ok: true;
      variants: { name: string; width: number; height: number; data: ArrayBuffer }[];
      report: ReturnType<typeof prepareForOcr>["report"];
    }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PrepareRequest>) => void) | null;
  postMessage: (message: PrepareResponse, transfer: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const { id, width, height, data, thorough, quarterTurns } = event.data;
  try {
    const gray: Gray = { width, height, data: new Uint8ClampedArray(data) };
    const prepared = prepareForOcr(gray, { thorough, quarterTurns });
    const variants = prepared.variants.map((v) => ({
      name: v.name,
      width: v.image.width,
      height: v.image.height,
      data: v.image.data.buffer as ArrayBuffer,
    }));
    scope.postMessage(
      { id, ok: true, variants, report: prepared.report },
      variants.map((v) => v.data)
    );
  } catch (error) {
    scope.postMessage(
      { id, ok: false, error: error instanceof Error ? error.message : String(error) },
      []
    );
  }
};

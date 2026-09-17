import { createClient } from "@/lib/supabase/client";

/** The private bucket created by migration 0022. */
const SCAN_BUCKET = "dc-scans";

/** Longest edge kept. Readable on screen and well under the bucket's 5 MB cap. */
const STORED_LONG_EDGE = 2200;

/**
 * The photograph as it will be stored: the original picture, only scaled down
 * and saved as JPEG so a phone photo fits the bucket. Nothing OCR does to the
 * image (greyscale, contrast) is applied, so what is kept is what the camera
 * saw.
 */
async function storableImage(file: File, failure: string): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > STORED_LONG_EDGE ? STORED_LONG_EDGE / longEdge : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error(failure);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error(failure);
  return blob;
}

/**
 * Stores the original scan photograph and returns where it was put.
 *
 * Uploaded with the signed-in user's own session. The path is new every time
 * and upsert is off, so an image already stored can never be overwritten.
 */
export async function uploadScanImage(
  file: File,
  /** Shown when this device cannot prepare the image, in the operator's language. */
  failure = "Could not prepare the image on this device."
): Promise<string> {
  const blob = await storableImage(file, failure);
  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.jpg`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(SCAN_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Stores the prepared image OCR read, beside the original and never in its
 * place. Kept under its own folder so the two can never be confused.
 */
export async function uploadProcessedScanImage(blob: Blob): Promise<string> {
  const now = new Date();
  const path = `processed/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.jpg`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(SCAN_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

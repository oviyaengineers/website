import { headers } from "next/headers";
import { toDataURL, toString as toQrString } from "qrcode";
import type { createClient } from "@/lib/supabase/server";

/** The shape of a public challan token (migration 0028). */
export const PUBLIC_DC_TOKEN = /^[0-9a-f]{64}$/;

export function publicDcPath(token: string): string {
  return `/dc/view/${token}`;
}

/**
 * The site's own address, for the link inside the QR code. Taken from the
 * configured site URL when there is one, otherwise from the request, so the
 * code points at whichever domain printed it.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "oviyaengineers.in";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export type DcQrCode = {
  url: string;
  /** For the printed sheet. */
  svg: string;
  /** For the downloaded PDF. */
  png: string;
};

/**
 * The QR code for one challan, making its public link the first time.
 *
 * Returns null when the link cannot be made, so the challan still prints,
 * just without a code, rather than failing altogether.
 */
export async function dcQrCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dcId: string
): Promise<DcQrCode | null> {
  const { data: token, error } = await supabase.rpc("ensure_dc_public_link", { p_dc_id: dcId });
  if (error || typeof token !== "string" || !PUBLIC_DC_TOKEN.test(token)) return null;

  const url = `${await siteOrigin()}${publicDcPath(token)}`;
  const options = { errorCorrectionLevel: "M" as const, margin: 1 };
  const [svg, png] = await Promise.all([
    toQrString(url, { ...options, type: "svg" }),
    toDataURL(url, { ...options, width: 240 }),
  ]);
  return { url, svg, png };
}

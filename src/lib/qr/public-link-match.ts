/**
 * What a scanned QR code may open.
 *
 * Only a public challan link printed by this system is followed: our own
 * domain, the path /dc/view/ and a 64-character random token. Anything else
 * (another website, a DC number, a database id) is refused, so the scanner can
 * never be used to send somebody to an arbitrary address, and nothing about
 * the token is ever shown on screen.
 */

/** Domains the printed codes point at, besides the one the app is open on. */
export const QR_HOSTS = ["oviyaengineers.in", "www.oviyaengineers.in"] as const;

const TOKEN_PATH = /^\/dc\/view\/([0-9a-f]{64})\/?$/i;

/**
 * The same-site path to open for a scanned code, or null when the code is not
 * one of our challan links.
 *
 * currentHost is the host the app is running on (e.g. localhost:3000), so a
 * code scanned while testing opens on the same site it was scanned from.
 */
export function publicDcPathFromQr(text: string, currentHost?: string | null): string | null {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 300) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;

  const host = url.host.toLowerCase();
  const allowed = new Set<string>(QR_HOSTS);
  if (currentHost) allowed.add(currentHost.toLowerCase());
  if (!allowed.has(host)) return null;
  // Plain http only for a local test server.
  if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return null;

  const match = TOKEN_PATH.exec(url.pathname);
  if (!match) return null;
  return `/dc/view/${match[1].toLowerCase()}`;
}

/**
 * The modules behind the 4-digit PIN, and which screens belong to each.
 *
 * Pure, so the proxy, the server and the tests read one list. The PIN adds a
 * lock only: whoever unlocks a module still has exactly the permissions their
 * role gives them, enforced by the database (migration 0030).
 */

export const LOCKED_MODULES = ["billing", "weight"] as const;
export type LockedModule = (typeof LOCKED_MODULES)[number];

export function isLockedModule(value: unknown): value is LockedModule {
  return value === "billing" || value === "weight";
}

/** Every route of each module. A prefix covers the page and everything under it. */
const MODULE_ROUTES: Record<LockedModule, string[]> = {
  billing: [
    "/dashboard/invoices",
    "/dashboard/reports",
    "/dashboard/settings/billing",
    "/dashboard/settings/invoice-numbers",
    "/dashboard/settings/rates",
  ],
  weight: ["/dashboard/weight"],
};

/** The unlock screen itself, never locked. */
export const UNLOCK_PATH = "/dashboard/unlock";

/** The module a path belongs to, or null for everything else. */
export function moduleForPath(pathname: string): LockedModule | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const name of LOCKED_MODULES) {
    if (MODULE_ROUTES[name].some((route) => path === route || path.startsWith(`${route}/`))) {
      return name;
    }
  }
  return null;
}

/**
 * Where to go after unlocking: the requested page if it belongs to that module,
 * otherwise the module's home. Never another site, and never a different
 * module, so an unlock link cannot be used to bounce anywhere.
 */
export function afterUnlockPath(module: LockedModule, next: string | null | undefined): string {
  const home = MODULE_ROUTES[module][0];
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  const pathname = next.split(/[?#]/)[0];
  return moduleForPath(pathname) === module ? next : home;
}

/** The unlock screen for a module, remembering the page that was asked for. */
export function unlockPathFor(module: LockedModule, next: string): string {
  return `${UNLOCK_PATH}/${module}?next=${encodeURIComponent(next)}`;
}

/** Exactly four digits: the only shape a PIN can take. */
export function isPinShape(value: string): boolean {
  return /^[0-9]{4}$/.test(value);
}

/** Exactly six digits: the emailed code. */
export function isOtpShape(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}

/**
 * A PIN nobody should use, checked again by the database: all one digit, a
 * straight run up or down, two repeated pairs, or a handful of common picks.
 */
export function isObviousPin(pin: string): boolean {
  if (!isPinShape(pin)) return true;
  const d = pin.split("").map(Number);
  if (d.every((digit) => digit === d[0])) return true;
  if (
    (d[1] === d[0] + 1 && d[2] === d[1] + 1 && d[3] === d[2] + 1) ||
    (d[1] === d[0] - 1 && d[2] === d[1] - 1 && d[3] === d[2] - 1)
  )
    return true;
  if ((d[0] === d[2] && d[1] === d[3]) || (d[0] === d[1] && d[2] === d[3])) return true;
  return ["2580", "0852", "1004", "2000", "1010", "6969", "1998", "1999", "2001"].includes(pin);
}

/** The signed-in person's email with most of the name hidden, for "code sent to". */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  const shown = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(2, name.length - shown.length))}@${domain}`;
}

/**
 * Rules for Forgot User ID / Password on Staff Login.
 *
 * Pure checks, shared by the recovery page and its server actions. The server
 * applies every one again; Supabase Auth applies its own password policy on
 * top of these.
 */

/** Seconds before another code may be requested, matching the database limit. */
export const RECOVERY_RESEND_SECONDS = 60;

/** The cookie holding the recovery pass: httpOnly, secure, same-site, 10 minutes. */
export const RECOVERY_COOKIE = "oe_staff_recovery";
export const RECOVERY_PASS_SECONDS = 10 * 60;

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt, which Supabase Auth uses, ignores anything past 72 bytes. */
export const MAX_PASSWORD_BYTES = 72;

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isEmailShape(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function isRecoveryCodeShape(value: string | null | undefined): boolean {
  return /^\d{6}$/.test(value ?? "");
}

export function isRecoveryPass(value: string | null | undefined): boolean {
  return /^[0-9a-f]{64}$/.test(value ?? "");
}

export type PasswordProblem =
  "tooShort" | "tooLong" | "needsLetter" | "needsNumber" | "sameAsEmail" | "mismatch";

/** Everything wrong with a new password, in the order worth reading. */
export function passwordProblems(
  password: string,
  confirm: string,
  email: string | null | undefined
): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push("tooShort");
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) problems.push("tooLong");
  if (!/\p{L}/u.test(password)) problems.push("needsLetter");
  if (!/\p{N}/u.test(password)) problems.push("needsNumber");
  const login = normalizeEmail(email);
  if (
    login &&
    (password.trim().toLowerCase() === login ||
      password.trim().toLowerCase() === login.split("@")[0])
  ) {
    problems.push("sameAsEmail");
  }
  if (password !== confirm) problems.push("mismatch");
  return problems;
}

/** The address used to limit requests per network, from the proxy headers. */
export function clientKey(forwardedFor: string | null, realIp: string | null): string {
  const first = (forwardedFor ?? "").split(",")[0]?.trim();
  return first || realIp?.trim() || "unknown";
}

export type RecoveryErrorKey =
  | "auth.recoverTooSoon"
  | "auth.recoverLimit"
  | "auth.recoverBadEmail"
  | "auth.recoverExpired"
  | "auth.recoverError";

/** A database refusal as the message to show. Never reveals whether an account exists. */
export function recoveryErrorKey(message: string | null | undefined): RecoveryErrorKey {
  const text = message ?? "";
  if (text.includes("RECOVERY_TOO_SOON")) return "auth.recoverTooSoon";
  if (text.includes("RECOVERY_LIMIT")) return "auth.recoverLimit";
  if (text.includes("RECOVERY_BAD_EMAIL")) return "auth.recoverBadEmail";
  if (text.includes("RECOVERY_PASS_INVALID")) return "auth.recoverExpired";
  return "auth.recoverError";
}

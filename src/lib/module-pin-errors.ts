import type { TranslationKey } from "@/lib/i18n/types";

/**
 * The message for a refused PIN or code step, from the database's short code.
 *
 * Deliberately vague where it matters: a wrong PIN, a malformed one and a
 * missing one all read the same, and a wrong code reads the same as an
 * expired one. Nothing here ever carries a PIN or a code.
 */
export function modulePinErrorKey(message: string | null | undefined): TranslationKey {
  const text = message ?? "";
  if (text.includes("PIN_WEAK")) return "security.errorPinWeak";
  if (text.includes("PIN_SAME")) return "security.errorPinSame";
  if (text.includes("PIN_ALREADY_SET")) return "security.errorPinAlreadySet";
  if (text.includes("PIN_NOT_SET")) return "security.errorPinNotSet";
  if (text.includes("PIN_CURRENT_NOT_VERIFIED")) return "security.errorCurrentFirst";
  if (text.includes("OTP_TOO_SOON")) return "security.errorOtpTooSoon";
  if (text.includes("OTP_HOURLY_LIMIT")) return "security.errorOtpHourly";
  if (text.includes("OTP_NOT_VERIFIED")) return "security.errorOtpFirst";
  if (text.includes("OTP_NOT_ALLOWED") || text.includes("MODULE_NO_SESSION")) {
    return "security.errorSession";
  }
  return "security.errorGeneric";
}

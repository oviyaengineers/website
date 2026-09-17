"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/config";
import {
  afterUnlockPath,
  isLockedModule,
  isObviousPin,
  isOtpShape,
  isPinShape,
  maskEmail,
} from "@/lib/module-lock";
import { modulePinErrorKey } from "@/lib/module-pin-errors";
import { sendPinNoticeEmail, sendSecurityCodeEmail } from "@/lib/email";

/**
 * The PIN lock's server actions. Every decision is made by the database
 * (migration 0030); these only check shapes early, translate refusals, and
 * send the emails. No PIN, hash or code is ever returned, logged or stored
 * here: a code goes from the database straight into the email.
 */

type Purpose = "set" | "change" | "reset";
export type PinStepResult = { ok: boolean; error: string | null; sentTo?: string };

const isPurpose = (value: unknown): value is Purpose =>
  value === "set" || value === "change" || value === "reset";

/** The end of a lockout in India time, as the person will read it. */
function lockedUntilText(value: string, lang: Lang): string {
  return new Date(value).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type PinCheckRow = { ok: boolean; locked_until: string | null };

function firstRow<T>(data: T[] | T | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

/** The lock screen. On success the browser is sent on to the page it asked for. */
export async function unlockModuleAction(
  module: string,
  pin: string,
  next: string
): Promise<{ error: string | null }> {
  const { t, lang } = await getTranslator();
  if (!isLockedModule(module)) return { error: t("security.errorGeneric") };
  if (!isPinShape(String(pin ?? ""))) return { error: t("security.errorPinShape") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlock_module", { p_module: module, p_pin: pin });
  if (error) return { error: t(modulePinErrorKey(error.message)) };
  const row = firstRow(data as PinCheckRow[] | null);
  if (!row?.ok) {
    return {
      error: row?.locked_until
        ? t("security.lockedOut", { time: lockedUntilText(row.locked_until, lang) })
        : t("security.pinNotAccepted"),
    };
  }
  redirect(afterUnlockPath(module, next));
}

/** Change PIN, step 1: the current PIN, under the same lockout as unlocking. */
export async function verifyCurrentPinAction(pin: string): Promise<PinStepResult> {
  const { t, lang } = await getTranslator();
  if (!isPinShape(String(pin ?? ""))) return { ok: false, error: t("security.errorPinShape") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_current_module_pin", { p_pin: pin });
  if (error) return { ok: false, error: t(modulePinErrorKey(error.message)) };
  const row = firstRow(data as PinCheckRow[] | null);
  if (row?.ok) return { ok: true, error: null };
  return {
    ok: false,
    error: row?.locked_until
      ? t("security.lockedOut", { time: lockedUntilText(row.locked_until, lang) })
      : t("security.pinNotAccepted"),
  };
}

/**
 * Email a one-time code to the signed-in person's verified address.
 *
 * The person and session come from the login token, checked with the auth
 * server, never from the browser. The code is issued with the service role,
 * because the browser roles may not read it, and it is emailed at once. If the
 * email cannot be sent the code is withdrawn.
 */
export async function requestPinCodeAction(purpose: string): Promise<PinStepResult> {
  const { t } = await getTranslator();
  if (!isPurpose(purpose)) return { ok: false, error: t("security.errorGeneric") };
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.SECURITY_EMAIL_FROM ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, error: t("security.errorEmailNotConfigured") };
  }

  const supabase = await createClient();
  const [{ data: userData }, { data: claimsData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const user = userData.user;
  const sessionId = claimsData?.claims?.session_id;
  if (
    !user?.email ||
    !user.email_confirmed_at ||
    !sessionId ||
    claimsData?.claims?.sub !== user.id
  ) {
    return { ok: false, error: t("security.errorSession") };
  }

  let otpId: string | null = null;
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("issue_security_otp", {
      p_user: user.id,
      p_session: sessionId,
      p_purpose: purpose,
    });
    if (error) return { ok: false, error: t(modulePinErrorKey(error.message)) };
    const row = firstRow(data as { otp_id: string; code: string }[] | null);
    if (!row) return { ok: false, error: t("security.errorGeneric") };
    otpId = row.otp_id;
    await sendSecurityCodeEmail(user.email, row.code, purpose);
    return { ok: true, error: null, sentTo: maskEmail(user.email) };
  } catch {
    // Nothing from the failure is echoed or logged: it may concern a code.
    if (otpId) {
      await createServiceClient()
        .rpc("cancel_security_otp", { p_otp_id: otpId })
        .then(
          () => undefined,
          () => undefined
        );
    }
    return { ok: false, error: t("security.errorEmailFailed") };
  }
}

/** Check the emailed code. A wrong code and an expired one read the same. */
export async function verifyPinCodeAction(purpose: string, code: string): Promise<PinStepResult> {
  const { t } = await getTranslator();
  if (!isPurpose(purpose)) return { ok: false, error: t("security.errorGeneric") };
  if (!isOtpShape(String(code ?? ""))) return { ok: false, error: t("security.errorCodeShape") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_security_otp", {
    p_purpose: purpose,
    p_code: code,
  });
  if (error) return { ok: false, error: t(modulePinErrorKey(error.message)) };
  return data === true
    ? { ok: true, error: null }
    : { ok: false, error: t("security.errorCodeWrong") };
}

/** Save the new PIN after a verified code, then email a notice. */
export async function savePinAction(
  purpose: string,
  pin: string,
  confirm: string
): Promise<PinStepResult> {
  const { t } = await getTranslator();
  if (!isPurpose(purpose)) return { ok: false, error: t("security.errorGeneric") };
  if (!isPinShape(String(pin ?? ""))) return { ok: false, error: t("security.errorPinShape") };
  if (pin !== confirm) return { ok: false, error: t("security.errorPinMismatch") };
  if (isObviousPin(pin)) return { ok: false, error: t("security.errorPinWeak") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_module_pin", { p_purpose: purpose, p_new_pin: pin });
  if (error) return { ok: false, error: t(modulePinErrorKey(error.message)) };

  const { data } = await supabase.auth.getUser();
  if (data.user?.email) {
    // The PIN is already saved; a notice that fails to send does not undo it.
    await sendPinNoticeEmail(data.user.email, purpose).catch(() => undefined);
  }
  revalidatePath("/dashboard/settings/security");
  return { ok: true, error: null };
}

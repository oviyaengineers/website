"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendStaffPasswordChangedEmail, sendStaffRecoveryCodeEmail } from "@/lib/email";
import { getTranslator } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/types";
import {
  RECOVERY_COOKIE,
  RECOVERY_PASS_SECONDS,
  clientKey,
  isEmailShape,
  isRecoveryCodeShape,
  isRecoveryPass,
  normalizeEmail,
  passwordProblems,
  recoveryErrorKey,
  type PasswordProblem,
} from "@/lib/staff-recovery";

/**
 * Forgot User ID / Password for Staff Login (migration 0033).
 *
 * Every decision is made by the database functions, which only the server's
 * service role can run. No code, recovery pass or password is ever returned
 * to the browser, logged, or put in a URL: the code goes straight into the
 * email, and the pass lives in an httpOnly cookie. The password itself is
 * changed through Supabase Auth, the same login system as before; roles and
 * profiles are never touched.
 */

export type RecoveryResult = { ok: boolean; error: string | null };

type IssuedRow = {
  code_id: string;
  code: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
};
type AccountRow = { user_id: string; email: string; full_name: string | null };

async function clientAddress(): Promise<string> {
  const h = await headers();
  return clientKey(h.get("x-forwarded-for"), h.get("x-real-ip"));
}

function configured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.SECURITY_EMAIL_FROM &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Step 1. The same answer whether or not the address is a staff account, and
 * the email goes out after the response, so neither the wording nor the time
 * taken tells the two apart.
 */
export async function requestStaffRecoveryCodeAction(email: string): Promise<RecoveryResult> {
  const { t } = await getTranslator();
  if (!configured()) return { ok: false, error: t("auth.recoverNotConfigured") };
  if (!isEmailShape(email)) return { ok: false, error: t("auth.recoverBadEmail") };

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("issue_staff_recovery_code", {
    p_email: normalizeEmail(email),
    p_client: await clientAddress(),
  });
  if (error) return { ok: false, error: t(recoveryErrorKey(error.message)) };

  const row = (Array.isArray(data) ? data[0] : null) as IssuedRow | null;
  if (row?.user_id && row.email && row.code) {
    const { code_id: codeId, code, email: to } = row;
    after(async () => {
      try {
        await sendStaffRecoveryCodeEmail(to, code);
      } catch {
        // Nothing about the failure is logged: it concerns a code. The code is
        // withdrawn so it cannot be used, even though it never arrived.
        await createServiceClient()
          .rpc("cancel_staff_recovery_code", { p_code_id: codeId })
          .then(
            () => undefined,
            () => undefined
          );
      }
    });
  }
  return { ok: true, error: null };
}

/** Step 2. A right code sets the recovery pass cookie; nothing else changes. */
export async function verifyStaffRecoveryCodeAction(
  email: string,
  code: string
): Promise<RecoveryResult> {
  const { t } = await getTranslator();
  if (!configured()) return { ok: false, error: t("auth.recoverNotConfigured") };
  if (!isEmailShape(email) || !isRecoveryCodeShape(code)) {
    return { ok: false, error: t("auth.recoverCodeWrong") };
  }
  const { data, error } = await createServiceClient().rpc("verify_staff_recovery_code", {
    p_email: normalizeEmail(email),
    p_code: code,
    p_client: await clientAddress(),
  });
  if (error) return { ok: false, error: t(recoveryErrorKey(error.message)) };
  const row = (Array.isArray(data) ? data[0] : null) as {
    ok: boolean;
    grant_token: string | null;
  } | null;
  if (!row?.ok || !isRecoveryPass(row.grant_token)) {
    return { ok: false, error: t("auth.recoverCodeWrong") };
  }

  (await cookies()).set(RECOVERY_COOKIE, row.grant_token as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth",
    maxAge: RECOVERY_PASS_SECONDS,
  });
  return { ok: true, error: null };
}

async function recoveredAccount(): Promise<(AccountRow & { pass: string }) | null> {
  const pass = (await cookies()).get(RECOVERY_COOKIE)?.value;
  if (!pass || !isRecoveryPass(pass)) return null;
  const { data, error } = await createServiceClient().rpc("staff_recovery_account", {
    p_token: pass,
  });
  const row = (!error && Array.isArray(data) ? data[0] : null) as AccountRow | null;
  return row ? { ...row, pass } : null;
}

/** Step 3a. The login email (the User ID) and name of the verified account only. */
export async function showStaffUserIdAction(): Promise<
  RecoveryResult & { userId?: string; name?: string | null }
> {
  const { t } = await getTranslator();
  const account = await recoveredAccount();
  if (!account) return { ok: false, error: t("auth.recoverExpired") };
  await createServiceClient()
    .rpc("note_staff_user_id_shown", { p_user: account.user_id })
    .then(
      () => undefined,
      () => undefined
    );
  return { ok: true, error: null, userId: account.email, name: account.full_name };
}

const PASSWORD_PROBLEM_KEYS: Record<PasswordProblem, TranslationKey> = {
  tooShort: "auth.passwordTooShort",
  tooLong: "auth.passwordTooLong",
  needsLetter: "auth.passwordNeedsLetter",
  needsNumber: "auth.passwordNeedsNumber",
  sameAsEmail: "auth.passwordSameAsEmail",
  mismatch: "auth.passwordMismatch",
};

/**
 * Step 3b. Changes the password through Supabase Auth, then spends the pass,
 * cancels every open code and ends every session of the account.
 */
export async function resetStaffPasswordAction(
  password: string,
  confirm: string
): Promise<RecoveryResult> {
  const { t } = await getTranslator();
  const account = await recoveredAccount();
  if (!account) return { ok: false, error: t("auth.recoverExpired") };

  const newPassword = String(password ?? "");
  const problems = passwordProblems(newPassword, String(confirm ?? ""), account.email);
  if (problems.length > 0) return { ok: false, error: t(PASSWORD_PROBLEM_KEYS[problems[0]]) };

  const admin = createServiceClient();
  // Only the password: role, name and every other account detail stay as they are.
  const { error: updateError } = await admin.auth.admin.updateUserById(account.user_id, {
    password: newPassword,
  });
  if (updateError) {
    // Supabase's own password policy. Its wording is about the password only.
    return { ok: false, error: t("auth.passwordRejected", { reason: updateError.message }) };
  }

  const { error: completeError } = await admin.rpc("complete_staff_password_reset", {
    p_token: account.pass,
  });
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: "/auth" });
  if (completeError) return { ok: false, error: t(recoveryErrorKey(completeError.message)) };

  const to = account.email;
  after(async () => {
    await sendStaffPasswordChangedEmail(to).catch(() => undefined);
  });
  return { ok: true, error: null };
}

/** Leaves the recovery flow, dropping any recovery pass. */
export async function cancelStaffRecoveryAction(): Promise<void> {
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: "/auth" });
}

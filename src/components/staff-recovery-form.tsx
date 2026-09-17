"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import {
  cancelStaffRecoveryAction,
  requestStaffRecoveryCodeAction,
  resetStaffPasswordAction,
  showStaffUserIdAction,
  verifyStaffRecoveryCodeAction,
} from "@/lib/actions/staff-recovery";
import { RECOVERY_RESEND_SECONDS, isEmailShape, passwordProblems } from "@/lib/staff-recovery";

type Step = "email" | "code" | "choose" | "userId" | "password" | "done";

const FIELD = "h-11 border-slate-700 bg-slate-950 text-slate-100";

/**
 * Forgot User ID / Password. Every check happens on the server; this only
 * moves between steps. Codes and passwords are cleared from the fields as
 * soon as they have been sent, and nothing is kept in the browser.
 */
export function StaffRecoveryForm() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<{ id: string; name: string | null } | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  function sendCode() {
    setError(null);
    if (!isEmailShape(email)) {
      setError(t("auth.recoverBadEmail"));
      return;
    }
    startTransition(async () => {
      const result = await requestStaffRecoveryCodeAction(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(t("auth.codeSentGeneric"));
      setResendAt(Date.now() + RECOVERY_RESEND_SECONDS * 1000);
      setNow(Date.now());
      setStep("code");
    });
  }

  function verify() {
    setError(null);
    const attempt = code;
    setCode("");
    startTransition(async () => {
      const result = await verifyStaffRecoveryCodeAction(email, attempt);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(null);
      setStep("choose");
    });
  }

  function showUserId() {
    setError(null);
    startTransition(async () => {
      const result = await showStaffUserIdAction();
      if (!result.ok || !result.userId) {
        setError(result.error);
        setStep("email");
        return;
      }
      setUserId({ id: result.userId, name: result.name ?? null });
      setStep("userId");
    });
  }

  function savePassword() {
    setError(null);
    const problems = passwordProblems(password, confirm, email);
    if (problems.length > 0) {
      const keys = {
        tooShort: "auth.passwordTooShort",
        tooLong: "auth.passwordTooLong",
        needsLetter: "auth.passwordNeedsLetter",
        needsNumber: "auth.passwordNeedsNumber",
        sameAsEmail: "auth.passwordSameAsEmail",
        mismatch: "auth.passwordMismatch",
      } as const;
      setError(t(keys[problems[0]]));
      return;
    }
    const [next, again] = [password, confirm];
    startTransition(async () => {
      const result = await resetStaffPasswordAction(next, again);
      setPassword("");
      setConfirm("");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUserId(null);
      setStep("done");
    });
  }

  function startOver() {
    setError(null);
    setNotice(null);
    setCode("");
    setPassword("");
    setConfirm("");
    setUserId(null);
    setStep("email");
    void cancelStaffRecoveryAction();
  }

  return (
    <Card className="border-slate-800 bg-slate-900/60 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-slate-100">{t("auth.recoverTitle")}</CardTitle>
        {step === "email" && <p className="text-sm text-slate-400">{t("auth.recoverIntro")}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "email" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="recover-email" className="text-slate-300">
                {t("auth.registeredEmail")}
              </Label>
              <Input
                id="recover-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              <Mail className="h-4 w-4" /> {pending ? t("auth.sending") : t("auth.sendCode")}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            {notice && (
              <p role="status" className="rounded-md bg-slate-800/80 p-3 text-sm text-slate-200">
                {notice}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="recover-code" className="text-slate-300">
                {t("auth.enterCode")}
              </Label>
              <Input
                id="recover-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${FIELD} text-center text-xl tracking-[0.4em]`}
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending || code.length !== 6}>
              {pending ? t("auth.verifying") : t("auth.verifyCode")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-slate-300 hover:bg-slate-800 hover:text-white"
                disabled={pending || waitSeconds > 0}
                onClick={sendCode}
              >
                {waitSeconds > 0
                  ? t("auth.resendIn", { seconds: waitSeconds })
                  : t("auth.resendCode")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-slate-400 hover:bg-slate-800 hover:text-white"
                disabled={pending}
                onClick={startOver}
              >
                {t("auth.changeEmail")}
              </Button>
            </div>
          </form>
        )}

        {step === "choose" && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {t("auth.verifiedTitle")}
            </p>
            <p className="text-sm text-slate-300">{t("auth.chooseOption")}</p>
            <button
              type="button"
              onClick={showUserId}
              disabled={pending}
              className="flex w-full items-start gap-3 rounded-md border border-slate-700 bg-slate-950 p-3 text-left hover:border-slate-500 disabled:opacity-60"
            >
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
              <span>
                <span className="block font-medium text-slate-100">{t("auth.forgotUserId")}</span>
                <span className="block text-xs text-slate-400">{t("auth.forgotUserIdHint")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("password");
              }}
              disabled={pending}
              className="flex w-full items-start gap-3 rounded-md border border-slate-700 bg-slate-950 p-3 text-left hover:border-slate-500 disabled:opacity-60"
            >
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
              <span>
                <span className="block font-medium text-slate-100">{t("auth.resetPassword")}</span>
                <span className="block text-xs text-slate-400">{t("auth.resetPasswordHint")}</span>
              </span>
            </button>
          </div>
        )}

        {step === "userId" && userId && (
          <div className="space-y-4">
            <dl className="space-y-3 rounded-md border border-slate-700 bg-slate-950 p-3">
              <div>
                <dt className="text-xs text-slate-400">{t("auth.yourUserId")}</dt>
                <dd className="break-all text-base font-semibold text-slate-100">{userId.id}</dd>
              </div>
              {userId.name && (
                <div>
                  <dt className="text-xs text-slate-400">{t("auth.staffName")}</dt>
                  <dd className="text-slate-100">{userId.name}</dd>
                </div>
              )}
            </dl>
            <p className="text-sm text-slate-400">{t("auth.userIdNote")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800"
                onClick={() => setStep("password")}
              >
                {t("auth.resetPassword")}
              </Button>
              <Button
                render={
                  <Link href="/auth/login" onClick={() => void cancelStaffRecoveryAction()} />
                }
                className="h-11"
              >
                {t("auth.signIn")}
              </Button>
            </div>
          </div>
        )}

        {step === "password" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              savePassword();
            }}
          >
            <p className="text-xs text-slate-400">{t("auth.passwordRules")}</p>
            <div className="space-y-2">
              <Label htmlFor="recover-password" className="text-slate-300">
                {t("auth.newPassword")}
              </Label>
              <Input
                id="recover-password"
                type="password"
                autoComplete="new-password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recover-confirm" className="text-slate-300">
                {t("auth.confirmPassword")}
              </Label>
              <Input
                id="recover-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={FIELD}
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending || !password || !confirm}
            >
              {pending ? t("auth.saving") : t("auth.savePassword")}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p
              role="status"
              className="flex items-start gap-2 rounded-md bg-emerald-950/40 p-3 text-sm text-emerald-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {t("auth.passwordSaved")}
            </p>
            <Button render={<Link href="/auth/login" />} className="h-11 w-full">
              {t("auth.signIn")}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {step !== "done" && (
          <Link
            href="/auth/login"
            onClick={() => void cancelStaffRecoveryAction()}
            className="flex min-h-11 items-center justify-center gap-1 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> {t("auth.backToLogin")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

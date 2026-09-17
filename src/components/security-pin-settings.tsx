"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import {
  requestPinCodeAction,
  savePinAction,
  verifyCurrentPinAction,
  verifyPinCodeAction,
  type PinStepResult,
} from "@/lib/actions/module-pin";
import { isObviousPin, isOtpShape, isPinShape } from "@/lib/module-lock";

type Mode = "set" | "change" | "reset";
type Step = "current" | "send" | "code" | "newPin" | "done";

const STEPS: Record<Mode, Step[]> = {
  set: ["send", "code", "newPin"],
  change: ["current", "send", "code", "newPin"],
  reset: ["send", "code", "newPin"],
};

/** A digits-only field for a PIN or a code. Nothing typed here is kept anywhere else. */
function DigitsInput({
  label,
  length,
  value,
  onChange,
  secret,
  autoFocus,
}: {
  label: string;
  length: 4 | 6;
  value: string;
  onChange: (value: string) => void;
  secret: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Input
        type={secret ? "password" : "text"}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        autoComplete={length === 6 ? "one-time-code" : "off"}
        autoFocus={autoFocus}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        className="h-11 max-w-48 text-center text-xl tracking-[0.4em]"
      />
    </label>
  );
}

/**
 * Set, change or reset the Billing & Weight PIN.
 *
 * Every step is decided on the server and in the database; this only collects
 * digits and moves between steps. Set and Forgot need an emailed code; Change
 * needs the current PIN first, then the code. Fields are cleared as soon as
 * they have been used.
 */
export function SecurityPinSettings({
  hasPin,
  initialMode,
}: {
  hasPin: boolean;
  initialMode: Mode | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(
    initialMode === "set" && !hasPin
      ? "set"
      : initialMode && hasPin && initialMode !== "set"
        ? initialMode
        : null
  );
  const [step, setStep] = useState<Step>(mode ? STEPS[mode][0] : "send");
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Mode | null>(null);
  const [pending, startTransition] = useTransition();

  function start(next: Mode) {
    setMode(next);
    setStep(STEPS[next][0]);
    setCurrent("");
    setCode("");
    setPin("");
    setConfirm("");
    setError(null);
    setDone(null);
  }

  function cancel() {
    setMode(null);
    setCurrent("");
    setCode("");
    setPin("");
    setConfirm("");
    setError(null);
  }

  function run(action: () => Promise<PinStepResult>, onOk: (result: PinStepResult) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onOk(result);
      else setError(result.error);
    });
  }

  const steps = mode ? STEPS[mode] : [];
  const stepNumber = steps.indexOf(step) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <ShieldCheck
          className={`mt-0.5 h-5 w-5 shrink-0 ${hasPin ? "text-green-600" : "text-amber-500"}`}
        />
        <div className="space-y-3">
          <p className="text-sm">{hasPin ? t("security.statusSet") : t("security.statusNotSet")}</p>
          {!mode && (
            <div className="flex flex-wrap gap-2">
              {hasPin ? (
                <>
                  <Button
                    type="button"
                    onClick={() => start("change")}
                    className="h-11 bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
                  >
                    <KeyRound className="h-4 w-4" /> {t("security.changePin")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => start("reset")}
                    className="h-11 sm:h-9"
                  >
                    {t("security.forgotPin")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => start("set")}
                  className="h-11 bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
                >
                  <KeyRound className="h-4 w-4" /> {t("security.setPin")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {done && !mode && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {done === "set"
              ? t("security.pinSaved")
              : done === "change"
                ? t("security.pinChanged")
                : t("security.pinReset")}{" "}
            {t("security.emailNotice")}
          </span>
        </p>
      )}

      {mode && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              {mode === "set"
                ? t("security.setPin")
                : mode === "change"
                  ? t("security.changePin")
                  : t("security.forgotPin")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t("security.stepOf", { step: stepNumber, total: steps.length })}
            </span>
          </div>

          {step === "current" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isPinShape(current)) return setError(t("security.errorPinShape"));
                const attempt = current;
                setCurrent("");
                run(
                  () => verifyCurrentPinAction(attempt),
                  () => setStep("send")
                );
              }}
            >
              <DigitsInput
                label={t("security.currentPin")}
                length={4}
                value={current}
                onChange={setCurrent}
                secret
                autoFocus
              />
              <Button
                type="submit"
                disabled={pending || current.length !== 4}
                className="h-11 sm:h-9"
              >
                {t("security.continue")}
              </Button>
            </form>
          )}

          {step === "send" && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => requestPinCodeAction(mode),
                  (result) => {
                    setSentTo(result.sentTo ?? "");
                    setStep("code");
                  }
                )
              }
              className="h-11 sm:h-9"
            >
              <Mail className="h-4 w-4" />{" "}
              {pending ? t("security.sending") : t("security.sendCode")}
            </Button>
          )}

          {step === "code" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isOtpShape(code)) return setError(t("security.errorCodeShape"));
                const attempt = code;
                setCode("");
                run(
                  () => verifyPinCodeAction(mode, attempt),
                  () => setStep("newPin")
                );
              }}
            >
              {sentTo && (
                <p className="text-sm text-muted-foreground">
                  {t("security.codeSentTo", { email: sentTo })}
                </p>
              )}
              <DigitsInput
                label={t("security.codeLabel")}
                length={6}
                value={code}
                onChange={setCode}
                secret={false}
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={pending || code.length !== 6}
                  className="h-11 sm:h-9"
                >
                  {pending ? t("security.verifying") : t("security.verifyCode")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => requestPinCodeAction(mode),
                      (result) => setSentTo(result.sentTo ?? sentTo)
                    )
                  }
                  className="h-11 sm:h-9"
                >
                  {t("security.resendCode")}
                </Button>
              </div>
            </form>
          )}

          {step === "newPin" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isPinShape(pin) || !isPinShape(confirm))
                  return setError(t("security.errorPinShape"));
                if (pin !== confirm) return setError(t("security.errorPinMismatch"));
                if (isObviousPin(pin)) return setError(t("security.errorPinWeak"));
                const [newPin, again] = [pin, confirm];
                setPin("");
                setConfirm("");
                const finished = mode;
                run(
                  () => savePinAction(finished, newPin, again),
                  () => {
                    setDone(finished);
                    setMode(null);
                    router.refresh();
                  }
                );
              }}
            >
              <p className="text-xs text-muted-foreground">{t("security.pinRules")}</p>
              <DigitsInput
                label={t("security.newPin")}
                length={4}
                value={pin}
                onChange={setPin}
                secret
                autoFocus
              />
              <DigitsInput
                label={t("security.confirmPin")}
                length={4}
                value={confirm}
                onChange={setConfirm}
                secret
              />
              <Button
                type="submit"
                disabled={pending || pin.length !== 4 || confirm.length !== 4}
                className="h-11 bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
              >
                {pending ? t("security.saving") : t("security.savePin")}
              </Button>
            </form>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={cancel}
            disabled={pending}
            className="h-11 sm:h-8"
          >
            {t("security.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}

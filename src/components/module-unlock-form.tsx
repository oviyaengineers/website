"use client";

import { useRef, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { unlockModuleAction } from "@/lib/actions/module-pin";
import { isPinShape, type LockedModule } from "@/lib/module-lock";

/**
 * The PIN entry. The PIN only ever lives in this input and the request that
 * checks it: it is cleared after every attempt, never stored, and the
 * response carries nothing but a message.
 */
export function ModuleUnlockForm({
  module,
  next,
  disabled = false,
}: {
  module: LockedModule;
  next: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isPinShape(pin)) {
      setError(t("security.errorPinShape"));
      return;
    }
    const attempt = pin;
    setPin("");
    startTransition(async () => {
      const result = await unlockModuleAction(module, attempt, next);
      // Only reached when the PIN was refused: success navigates away.
      setError(result?.error ?? null);
      input.current?.focus();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="off">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("security.enterPin")}</span>
        <Input
          ref={input}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          autoFocus
          name="module-pin"
          aria-label={t("security.enterPin")}
          value={pin}
          disabled={disabled || pending}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setError(null);
          }}
          className="h-12 text-center text-2xl tracking-[0.6em]"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={disabled || pending || pin.length !== 4}
        className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90"
      >
        <Lock className="h-4 w-4" />
        {pending ? t("security.unlocking") : t("security.unlock")}
      </Button>
    </form>
  );
}

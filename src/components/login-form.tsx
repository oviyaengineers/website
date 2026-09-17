"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, {
    error: null,
  });

  return (
    <Card className="border-slate-800 bg-slate-900/60 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-slate-100">{t("auth.signIn")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              {t("auth.email")}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@oviyaengineers.com"
              className="h-11 border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              {t("auth.password")}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-11 border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          {state.error && (
            <p className="text-sm text-red-400" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
          <p className="text-center">
            <Link
              href="/auth/recover"
              className="inline-flex min-h-11 items-center text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline"
            >
              {t("auth.forgotLink")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

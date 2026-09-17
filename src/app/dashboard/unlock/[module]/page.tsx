import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModuleUnlockForm } from "@/components/module-unlock-form";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/server";
import { afterUnlockPath, isLockedModule } from "@/lib/module-lock";
import { isModuleUnlocked } from "@/lib/module-lock-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("security.enterPin")} | Oviya Engineers` };
}

/** The lock screen for Billing or Weight / Scrap. */
export default async function UnlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ module: name }, { next }] = await Promise.all([params, searchParams]);
  if (!isLockedModule(name)) notFound();
  const target = afterUnlockPath(name, next);
  if (await isModuleUnlocked(name)) redirect(target);

  const supabase = await createClient();
  const [{ data: status }, { t, lang }] = await Promise.all([
    supabase.rpc("module_pin_status"),
    getTranslator(),
  ]);
  const row = Array.isArray(status) ? status[0] : null;
  const hasPin = row?.has_pin === true;
  const lockedUntil = row?.locked_until ?? null;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm items-center">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#10233f] text-amber-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl text-[#10233f] dark:text-white">
            {name === "billing" ? t("security.lockedBilling") : t("security.lockedWeight")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasPin ? (
            <>
              {lockedUntil ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("security.lockedOut", {
                    time: new Date(lockedUntil).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  })}
                </p>
              ) : null}
              <ModuleUnlockForm module={name} next={target} />
              <p className="text-xs text-muted-foreground">{t("security.unlockNote")}</p>
              <div className="text-center">
                <Link
                  href="/dashboard/settings/security?mode=reset"
                  className="text-sm text-[#10233f] underline-offset-2 hover:underline dark:text-sky-300"
                >
                  {t("security.forgotPin")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("security.noPinYet")}</p>
              <Button
                render={<Link href="/dashboard/settings/security?mode=set" />}
                className="h-11 w-full bg-[#10233f] hover:bg-[#10233f]/90"
              >
                {t("security.setUpPin")}
              </Button>
            </>
          )}
          <div className="text-center">
            <Link href="/dashboard" className="text-xs text-muted-foreground hover:underline">
              {t("security.backToDashboard")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

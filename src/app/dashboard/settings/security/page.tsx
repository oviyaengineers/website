import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecurityPinSettings } from "@/components/security-pin-settings";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("security.title")} | Oviya Engineers` };
}

/** Settings → Security: each person's own Billing & Weight PIN. */
export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ mode }, supabase, { t }] = await Promise.all([
    searchParams,
    createClient(),
    getTranslator(),
  ]);
  const { data } = await supabase.rpc("module_pin_status");
  const hasPin = Array.isArray(data) && data[0]?.has_pin === true;
  const initialMode = mode === "set" || mode === "change" || mode === "reset" ? mode : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("security.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("security.intro")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f] dark:text-white">
            {t("security.pinCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityPinSettings hasPin={hasPin} initialMode={initialMode} />
        </CardContent>
      </Card>
    </div>
  );
}

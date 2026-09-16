import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DcNumberSettingsForm } from "@/components/dc-number-settings-form";
import { getDcNumberSeries } from "@/lib/actions/dc-numbering";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("settings.dcNumbersTitle")} | Oviya Engineers` };
}

export default async function DcNumberSettingsPage() {
  const [series, { t }] = await Promise.all([getDcNumberSeries(), getTranslator()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.dcNumbersTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.dcNumbersIntro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.seriesCard")}</CardTitle>
        </CardHeader>
        <CardContent>
          {series ? (
            <DcNumberSettingsForm series={series} />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-destructive">{t("settings.notSetUp")}</p>
              <p className="text-muted-foreground">{t("settings.notSetUpHelp")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.changeCard")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t("settings.changeNote1")}</p>
          <p>{t("settings.changeNote2")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

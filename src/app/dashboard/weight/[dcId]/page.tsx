import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DcStatusBadge } from "@/components/status-badge";
import { WeightEditor } from "@/components/weight-editor";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { fetchWeightDc } from "@/lib/weight-data";
import { formatDate } from "@/lib/i18n/dates";
import { getTranslator } from "@/lib/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("weight.title")} | Oviya Engineers` };
}

/** Weight entry for every line of one DC. Admins edit; everyone else views. */
export default async function WeightDcPage({ params }: { params: Promise<{ dcId: string }> }) {
  const { dcId } = await params;
  if (!UUID.test(dcId)) notFound();

  const [dc, { profile }, { t, lang }] = await Promise.all([
    fetchWeightDc(dcId),
    getCurrentUserAndProfile(),
    getTranslator(),
  ]);
  if (!dc) notFound();

  const isAdmin = profile?.role === "admin";
  const isDraft = dc.lifecycle === "draft";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          render={<Link href="/dashboard/weight" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <ArrowLeft className="h-4 w-4" /> {t("weight.backToList")}
        </Button>
        <Button
          render={<Link href={`/dashboard/dc/${dc.id}`} />}
          variant="ghost"
          className="h-11 sm:h-8"
        >
          <ExternalLink className="h-4 w-4" /> {t("weight.openDc")}
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {t("weight.editorTitle", { dc: dc.dcNumber })}
          <DcStatusBadge status={dc.lifecycle} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(dc.dcDate, "dd MMM yyyy", lang)} · {dc.customerName}
          {dc.customerDcNumbers.length > 0
            ? ` · ${t("weight.customerDcNo")}: ${dc.customerDcNumbers.join(", ")}`
            : ""}
        </p>
        <p className="text-sm text-muted-foreground">{t("weight.editorIntro")}</p>
      </div>

      {isDraft ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("weight.draftNote")}
          </CardContent>
        </Card>
      ) : dc.lines.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("weight.noItems")}
          </CardContent>
        </Card>
      ) : (
        <>
          {!isAdmin && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {t("weight.adminOnlyNote")}
            </p>
          )}
          <WeightEditor
            // A fresh editor after each save, so it starts from what was stored.
            key={dc.lines.map((line) => line.weight?.updated_at ?? "-").join("|")}
            dcId={dc.id}
            lines={dc.lines}
            canEdit={isAdmin}
          />
        </>
      )}
    </div>
  );
}

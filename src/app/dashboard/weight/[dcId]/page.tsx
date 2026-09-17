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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Weight / Scrap | Oviya Engineers" };

/** Weight / Scrap for every line of one DC. Admins record; everyone else views. */
export default async function WeightDcPage({ params }: { params: Promise<{ dcId: string }> }) {
  const { dcId } = await params;
  if (!UUID.test(dcId)) notFound();

  const [dc, { profile }] = await Promise.all([fetchWeightDc(dcId), getCurrentUserAndProfile()]);
  if (!dc) notFound();

  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          render={<Link href="/dashboard/weight" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Weight / Scrap
        </Button>
        <Button
          render={<Link href={`/dashboard/dc/${dc.id}`} />}
          variant="ghost"
          className="h-11 sm:h-8"
        >
          <ExternalLink className="h-4 w-4" /> Open DC
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          Weight / Scrap · {dc.dcNumber}
          <DcStatusBadge status={dc.lifecycle} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(dc.dcDate, "dd MMM yyyy", "en")} · {dc.customerName}
          {dc.customerDcNumbers.length > 0
            ? ` · Customer DC No: ${dc.customerDcNumbers.join(", ")}`
            : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          Sent Qty comes from the DC and cannot be changed here. Weights come from the Weight/Scrap
          Master; enter the scrap rate to record a line.
        </p>
      </div>

      {dc.isDraft ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            This DC is a draft. Weight / Scrap can be recorded once it is issued.
          </CardContent>
        </Card>
      ) : dc.lines.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            This DC has no lines.
          </CardContent>
        </Card>
      ) : (
        <>
          {!isAdmin && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Only an admin can record Weight / Scrap. You can view it here.
            </p>
          )}
          <WeightEditor
            // A fresh editor after each save, so it starts from what was stored.
            key={dc.lines
              .map(
                (line) =>
                  `${line.status}:${line.recorded?.recordedAt ?? "-"}:${line.master?.id ?? "-"}`
              )
              .join("|")}
            dcId={dc.id}
            lines={dc.lines}
            canEdit={isAdmin}
          />
        </>
      )}
    </div>
  );
}

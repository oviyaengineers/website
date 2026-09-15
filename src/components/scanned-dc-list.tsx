"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Clock, Eye, FilePlus2, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { discardPendingScans, type ScannedDc } from "@/lib/actions/dc-scan-queue";
import { PENDING_SCAN_CHANGED } from "@/lib/dc-scan-handoff";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n/dates";

function ScanStatus({ status }: { status: ScannedDc["status"] }) {
  const { t } = useI18n();
  if (status === "converted") {
    return (
      <Badge variant="outline" className="border-transparent bg-green-100 text-green-700">
        <CheckCircle2 className="mr-1 h-3 w-3" /> {t("dcScan.convertedToDc")}
      </Badge>
    );
  }
  if (status === "discarded") {
    return (
      <Badge variant="outline" className="border-transparent bg-slate-100 text-slate-700">
        <Ban className="mr-1 h-3 w-3" /> {t("dcScan.statusDiscarded")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-800">
      <Clock className="mr-1 h-3 w-3" /> {t("dcScan.statusPending")}
    </Badge>
  );
}

function ScanItems({ scan }: { scan: ScannedDc }) {
  const { t } = useI18n();
  const received = scan.items.reduce((total, item) => total + (item.received_qty || 0), 0);
  if (scan.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dcScan.noItemsRead")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-medium">{t("dc.cols.description")}</th>
            <th className="py-1 text-left font-medium">{t("common.material")}</th>
            <th className="py-1 text-right font-medium">{t("dc.qty.received")}</th>
          </tr>
        </thead>
        <tbody>
          {scan.items.map((item, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-3">
                {item.component || (
                  <span className="text-destructive">{t("dcScan.componentNotChosen")}</span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground">{item.material ?? "-"}</td>
              <td className="py-1.5 text-right tabular-nums">{item.received_qty}</td>
            </tr>
          ))}
          <tr className="border-t font-medium">
            <td className="py-1.5" colSpan={2}>
              {t("dcScan.totalReceived")}
            </td>
            <td className="py-1.5 text-right tabular-nums">{received}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Customer DCs that have been received, and what became of them.
 *
 * A scan is an input record, not a challan of ours. It stays pending while
 * the work is in progress, however long that takes, and becomes converted
 * only when somebody saves our delivery challan from it. Nothing here has a DC
 * number, because none has been issued. Discarded scans are kept too, so a
 * customer DC that was seen can always be traced.
 */
export function ScannedDcList({
  pending,
  converted,
  discarded,
  searchTerm,
}: {
  pending: ScannedDc[];
  converted: ScannedDc[];
  discarded: ScannedDc[];
  /** Set when a search is narrowing the list, so "empty" can say why. */
  searchTerm?: string;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);

  function discard(id: string, label: string) {
    setWorking(id);
    startTransition(async () => {
      const { error } = await discardPendingScans([id]);
      setWorking(null);
      if (error) {
        toast.error(t("dcScan.couldNotDiscard", { error }));
        return;
      }
      window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
      toast.success(t("dcScan.setAside", { label }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {t("dcScan.pendingHeading")}
        </h2>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {searchTerm
                ? t("dcScan.noWaitingMatch", { q: searchTerm })
                : t("dcScan.nothingWaiting")}
            </CardContent>
          </Card>
        ) : (
          pending.map((scan) => {
            const label = scan.customerDcNumber || t("dcScan.thisChallan");
            return (
              <Card key={scan.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {scan.customerDcNumber || t("dcScan.noCustomerDcNumber")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {scan.customerDcDate
                          ? formatDate(scan.customerDcDate, "dd MMM yyyy", lang)
                          : t("dcScan.noDateRead")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ScanStatus status={scan.status} />
                      <p className="text-xs text-muted-foreground">
                        {t("dcScan.scannedAt", {
                          date: formatDate(scan.scannedAt, "dd MMM yyyy HH:mm", lang),
                        })}
                      </p>
                      {scan.imagePath ? (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" /> {t("dcScan.imageKept")}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <ScanItems scan={scan} />

                  {/* Full thumb height on a phone. Discard is destructive and
                      sits beside the others, so an undersized target here is
                      worse than a cramped layout. */}
                  <div className="flex flex-wrap gap-2 [&>*]:h-11 sm:[&>*]:h-8">
                    <Button
                      render={<Link href={`/dashboard/dc/scanned/${scan.id}`} />}
                      variant="outline"
                    >
                      <Eye className="h-4 w-4" /> {t("common.view")}
                    </Button>
                    <Button
                      render={<Link href={`/dashboard/dc/scanned/${scan.id}?edit=1`} />}
                      variant="outline"
                    >
                      <Pencil className="h-4 w-4" /> {t("common.edit")}
                    </Button>
                    {/* The scan id travels in the URL, so the form fills from
                        this one rather than from everything waiting. */}
                    <Button render={<Link href={`/dashboard/dc/new?scan=${scan.id}`} />}>
                      <FilePlus2 className="h-4 w-4" /> {t("dcScan.createDc")}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy && working === scan.id}
                      onClick={() => discard(scan.id, label)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {busy && working === scan.id ? t("dcScan.discarding") : t("dcScan.discard")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {converted.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("dcScan.convertedHeading")}
          </h2>
          {converted.map((scan) => (
            <Card key={scan.id} className="bg-muted/30">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {scan.customerDcNumber || t("dcScan.noCustomerDcNumber")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {scan.customerDcDate
                      ? formatDate(scan.customerDcDate, "dd MMM yyyy", lang)
                      : t("dcScan.noDateRead")}
                    {scan.convertedAt
                      ? t("dcScan.convertedOn", {
                          date: formatDate(scan.convertedAt, "dd MMM yyyy", lang),
                        })
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ScanStatus status={scan.status} />
                  <Button
                    render={<Link href={`/dashboard/dc/scanned/${scan.id}`} />}
                    variant="outline"
                    size="sm"
                    className="h-11 sm:h-7"
                  >
                    <Eye className="h-4 w-4" /> {t("dcScan.scanButton")}
                  </Button>
                  {scan.dcId ? (
                    <Button
                      render={<Link href={`/dashboard/dc/${scan.dcId}`} />}
                      variant="outline"
                      size="sm"
                      className="h-11 sm:h-7"
                    >
                      {scan.dcNumber ?? t("dcScan.openOurDc")}
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("dcScan.challanDeleted")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {discarded.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("dcScan.discardedHeading", { count: discarded.length })}
          </summary>
          <div className="mt-3 space-y-3">
            {discarded.map((scan) => (
              <Card key={scan.id} className="bg-muted/30">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {scan.customerDcNumber || t("dcScan.noCustomerDcNumber")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("dcScan.scannedAt", {
                        date: formatDate(scan.scannedAt, "dd MMM yyyy", lang),
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ScanStatus status={scan.status} />
                    <Button
                      render={<Link href={`/dashboard/dc/scanned/${scan.id}`} />}
                      variant="outline"
                      size="sm"
                      className="h-11 sm:h-7"
                    >
                      <Eye className="h-4 w-4" /> {t("common.view")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

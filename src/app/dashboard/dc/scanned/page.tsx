import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search-box";
import { ScannedDcList } from "@/components/scanned-dc-list";
import {
  listConvertedScans,
  listDiscardedScans,
  listPendingScans,
} from "@/lib/actions/dc-scan-queue";
import { scannedDcMatches } from "@/lib/dc-search";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcScan.scannedTitle")} | Oviya Engineers` };
}

/**
 * Customer DCs received, and what has become of them.
 *
 * Nothing on this screen is a delivery challan of ours. Scanning records what
 * the customer sent in; no DC number is issued and no challan exists until
 * somebody raises one, which may be days later when the work is finished.
 */
export default async function ScannedDcsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [allPending, allConverted, allDiscarded, { t }] = await Promise.all([
    listPendingScans(),
    listConvertedScans(),
    listDiscardedScans(),
    getTranslator(),
  ]);
  // Searching only narrows what is shown. It never converts, edits or
  // discards anything.
  const pending = q ? allPending.filter((scan) => scannedDcMatches(scan, q)) : allPending;
  const converted = q ? allConverted.filter((scan) => scannedDcMatches(scan, q)) : allConverted;
  const discarded = q ? allDiscarded.filter((scan) => scannedDcMatches(scan, q)) : allDiscarded;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("dcScan.scannedTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? t("dcScan.scannedMatch", { pending: pending.length, all: allPending.length, q })
              : t("dcScan.scannedIntro")}
          </p>
        </div>
        <Button
          render={<Link href="/dashboard/dc/scan" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <ScanLine className="h-4 w-4" /> {t("dcScan.scanAnother")}
        </Button>
      </div>

      <SearchBox placeholder={t("dcScan.scannedSearch")} />

      <ScannedDcList pending={pending} converted={converted} discarded={discarded} searchTerm={q} />
    </div>
  );
}

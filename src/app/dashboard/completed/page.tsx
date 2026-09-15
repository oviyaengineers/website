import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DcRowTable } from "@/components/dc-row-table";
import { DcFilters } from "@/components/dc-filters";
import { SearchBox } from "@/components/search-box";
import { fetchDcRows } from "@/lib/dc-rows";
import { dcRowMatches } from "@/lib/dc-search";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("nav.completedDcs")} | Oviya Engineers` };
}

/**
 * Item lines that are finished: every piece received has gone back, whether
 * machined and sent, returned with a material problem, or scrapped.
 *
 * Counted per line rather than per challan, because one challan can carry a
 * finished part alongside one still in hand.
 */
export default async function CompletedChallansPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    customer?: string;
    component?: string;
  }>;
}) {
  const filters = await searchParams;
  const { q } = filters;
  const supabase = await createClient();
  const [rows, { data: picklist }, { data: customers }, { t }] = await Promise.all([
    fetchDcRows(),
    supabase.from("dc_picklist_items").select("name").eq("kind", "component").order("name"),
    supabase.from("customers").select("name").order("name"),
    getTranslator(),
  ]);
  // Completed is exactly zero, from the same chain calculation as every screen.
  const finished = rows.filter((row) => row.received > 0 && row.pending === 0);
  // Filtering only narrows what is shown. The dates are our DC dates, both
  // days included.
  const completed = finished.filter(
    (row) =>
      (!q || dcRowMatches(row, q)) &&
      (!filters.from || row.dcDate >= filters.from) &&
      (!filters.to || row.dcDate <= filters.to) &&
      (!filters.customer || row.customerName === filters.customer) &&
      (!filters.component || row.component === filters.component)
  );
  const filtered = Boolean(
    q || filters.from || filters.to || filters.customer || filters.component
  );

  const totals = completed.reduce(
    (sum, row) => ({
      received: sum.received + row.received,
      sent: sum.sent + row.sent,
      materialProblem: sum.materialProblem + row.materialProblem,
      rejection: sum.rejection + row.rejection,
    }),
    { received: 0, sent: 0, materialProblem: 0, rejection: 0 }
  );
  const challans = new Set(completed.map((row) => row.dcId)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.completedDcs")}</h1>
          <p className="text-sm text-muted-foreground">{t("dcViews.completedIntro")}</p>
        </div>
        <Button
          render={<Link href="/dashboard/completed/print" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <Printer className="h-4 w-4" /> {t("dc.list.printList")}
        </Button>
      </div>

      <div className="space-y-3">
        <SearchBox placeholder={t("dcViews.completedSearch")} />
        <DcFilters
          defaults={filters}
          components={(picklist ?? []).map((item) => item.name)}
          customers={(customers ?? []).map((c) => c.name)}
          showStatus={false}
        />
      </div>

      {completed.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtered ? t("dcViews.completedNoMatch") : t("dcViews.completedNothingYet")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={t("dcViews.completedLines")}
              value={completed.length}
              note={
                challans === 1 ? t("dc.list.countOne") : t("dc.list.count", { count: challans })
              }
            />
            <Figure label={t("dc.qty.received")} value={totals.received} />
            <Figure label={t("dcViews.sentBack")} value={totals.sent} />
            <Figure
              label={t("dcViews.mpRejection")}
              value={totals.materialProblem + totals.rejection}
              note={`${totals.materialProblem} + ${totals.rejection}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[#10233f]">
                <CheckCircle2 className="h-4 w-4" />
                {completed.length === 1
                  ? t("dcViews.completedLineCountOne")
                  : t("dcViews.completedLineCount", { count: completed.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DcRowTable rows={completed} showPending={false} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

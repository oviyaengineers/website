import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DcRowTable } from "@/components/dc-row-table";
import { SearchBox } from "@/components/search-box";
import { fetchDcRows } from "@/lib/dc-rows";
import { dcRowMatches } from "@/lib/dc-search";

export const metadata: Metadata = { title: "Completed DCs | Oviya Engineers" };

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
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rows = await fetchDcRows();
  const finished = rows.filter((row) => row.received > 0 && row.pending === 0);
  const completed = q ? finished.filter((row) => dcRowMatches(row, q)) : finished;

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
          <h1 className="text-2xl font-semibold">Completed DCs</h1>
          <p className="text-sm text-muted-foreground">
            Lines where everything received has been accounted for back to the customer.
          </p>
        </div>
        <Button render={<Link href="/dashboard/completed/print" />} variant="outline">
          <Printer className="h-4 w-4" /> Print list
        </Button>
      </div>

      <SearchBox placeholder="Our DC number, customer DC number, customer, component, material or date..." />

      {completed.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q
              ? `No completed line matches "${q}".`
              : "Nothing is completed yet. A line appears here once its sent, material problem and rejection quantities together match what came in."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label="Completed lines"
              value={completed.length}
              note={`${challans} challan${challans === 1 ? "" : "s"}`}
            />
            <Figure label="Received" value={totals.received} />
            <Figure label="Sent back" value={totals.sent} />
            <Figure
              label="Material problem / rejection"
              value={totals.materialProblem + totals.rejection}
              note={`${totals.materialProblem} + ${totals.rejection}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[#10233f]">
                <CheckCircle2 className="h-4 w-4" />
                {completed.length} completed line{completed.length === 1 ? "" : "s"}
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

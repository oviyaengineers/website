import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DcRowTable } from "@/components/dc-row-table";
import { fetchDcRows } from "@/lib/dc-rows";

export const metadata: Metadata = { title: "Stock / Balance | Oviya Engineers" };

/**
 * Item lines still owing work: pieces received that have not gone back.
 *
 * That balance is the stock physically on our floor, which is why it is listed
 * here per part rather than per challan — the same casting can be outstanding
 * on several challans at once, and the total is what matters when counting.
 */
export default async function StockPage() {
  const rows = await fetchDcRows();
  const pending = rows.filter((row) => row.pending > 0);

  const totalPending = pending.reduce((sum, row) => sum + row.pending, 0);
  const challans = new Set(pending.map((row) => row.dcId)).size;

  // The same part outstanding on several challans is one pile in the workshop.
  const byPart = new Map<string, { component: string; material: string | null; pending: number }>();
  for (const row of pending) {
    const key = `${row.component}|${row.material ?? ""}`;
    const held = byPart.get(key);
    if (held) held.pending += row.pending;
    else
      byPart.set(key, { component: row.component, material: row.material, pending: row.pending });
  }
  const parts = [...byPart.values()].sort((a, b) => b.pending - a.pending);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock / Balance</h1>
          <p className="text-sm text-muted-foreground">
            Pieces received that have not yet gone back — what is still on the floor.
          </p>
        </div>
        <Button render={<Link href="/dashboard/stock/print" />} variant="outline">
          <Printer className="h-4 w-4" /> Print list
        </Button>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing is outstanding. Every piece received has been sent back, returned with a
            material problem, or scrapped.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="Pieces on the floor" value={totalPending} />
            <Figure
              label="Unfinished lines"
              value={pending.length}
              note={`${challans} challan${challans === 1 ? "" : "s"}`}
            />
            <Figure label="Distinct parts" value={parts.length} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[#10233f]">
                <Boxes className="h-4 w-4" />
                By part
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {parts.map((part) => (
                <div
                  key={`${part.component}|${part.material ?? ""}`}
                  className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0">
                    {part.component}
                    {part.material ? (
                      <span className="text-muted-foreground"> · {part.material}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{part.pending}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-[#10233f]">
                {pending.length} unfinished line{pending.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DcRowTable rows={pending} showPending />
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

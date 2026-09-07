import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { balanceQty, outwardTotal } from "@/lib/dc-balance";

export const metadata: Metadata = { title: "Balance | Oviya Engineers" };

/** How many months of inward/outward history to summarise. */
const MONTHS_SHOWN = 6;

function monthLabel(key: string): string {
  return format(new Date(`${key}-01T00:00:00`), "MMM yyyy");
}

export default async function BalancePage() {
  const supabase = await createClient();

  const [{ data: dcs }, { data: items }, { data: customers }] = await Promise.all([
    supabase.from("delivery_challans").select("id, dc_number, dc_date, customer_id"),
    supabase.from("delivery_challan_items").select("*"),
    supabase.from("customers").select("id, name"),
  ]);

  const dcMap = new Map((dcs ?? []).map((dc) => [dc.id, dc]));
  const customerMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const rows = (items ?? []).flatMap((item) => {
    const dc = dcMap.get(item.dc_id);
    if (!dc) return [];
    return [
      {
        id: item.id,
        dcId: dc.id,
        dcNumber: dc.dc_number,
        dcDate: dc.dc_date,
        customerName: customerMap.get(dc.customer_id) ?? "-",
        component: item.component,
        material: item.material,
        received: Number(item.received_qty) || 0,
        outward: outwardTotal(item),
        balance: balanceQty(item),
      },
    ];
  });

  // Inward and outward totals per calendar month of the DC date.
  const monthly = new Map<string, { inward: number; outward: number }>();
  for (const row of rows) {
    const key = row.dcDate.slice(0, 7);
    const bucket = monthly.get(key) ?? { inward: 0, outward: 0 };
    bucket.inward += row.received;
    bucket.outward += row.outward;
    monthly.set(key, bucket);
  }
  const months = [...monthly.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MONTHS_SHOWN);

  const pending = rows
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.dcDate.localeCompare(a.dcDate));
  const overDelivered = rows
    .filter((row) => row.balance < 0)
    .sort((a, b) => b.dcDate.localeCompare(a.dcDate));

  const totalPending = pending.reduce((sum, row) => sum + row.balance, 0);
  const totalInward = rows.reduce((sum, row) => sum + row.received, 0);
  const totalOutward = rows.reduce((sum, row) => sum + row.outward, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Balance</h1>
        <p className="text-sm text-muted-foreground">
          Job-work still to be completed, and inward vs outward totals by month.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending (not completed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPending.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">
              pieces across {pending.length} row{pending.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total inward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInward.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">pieces received, all time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total outward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalOutward.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">sent + material problem + rejection</p>
          </CardContent>
        </Card>
      </div>

      {overDelivered.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Balance error on {overDelivered.length} row
              {overDelivered.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-destructive">
            {overDelivered.map((row) => (
              <p key={row.id}>
                <Link href={`/dashboard/dc/${row.dcId}`} className="underline">
                  {row.dcNumber}
                </Link>{" "}
                — <span className="font-medium">{row.component}</span>: received {row.received},
                accounted out {row.outward} —{" "}
                <span className="font-medium">{-row.balance} extra.</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly inward vs outward</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Inward</TableHead>
                  <TableHead className="text-right">Outward</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map(([key, totals]) => {
                  const difference = totals.inward - totals.outward;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{monthLabel(key)}</TableCell>
                      <TableCell className="text-right">
                        {totals.inward.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {totals.outward.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell
                        className={
                          difference < 0
                            ? "text-right font-medium text-destructive"
                            : difference > 0
                              ? "text-right text-amber-600"
                              : "text-right text-muted-foreground"
                        }
                      >
                        {difference.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {months.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No delivery challans yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not completed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DC</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Outward</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.dcNumber}</TableCell>
                    <TableCell>{format(new Date(row.dcDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell>{row.component}</TableCell>
                    <TableCell>{row.material ?? "-"}</TableCell>
                    <TableCell className="text-right">{row.received}</TableCell>
                    <TableCell className="text-right">{row.outward}</TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {row.balance}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Rendering as an anchor, so tell Base UI not to expect
                          a native <button>. */}
                      <Button
                        render={<Link href={`/dashboard/dc/${row.dcId}`} />}
                        nativeButton={false}
                        variant="outline"
                        size="sm"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pending.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nothing pending — every piece received has been accounted for.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

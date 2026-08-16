import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Printer } from "lucide-react";
import { DcFilters } from "@/components/dc-filters";
import { DeleteDcButton } from "@/components/delete-dc-button";
import { DcStatusBadge } from "@/components/status-badge";
import type { DcStatus } from "@/types/database";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Delivery Challans | Oviya Engineers" };

export default async function DcListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; status?: string }>;
}) {
  const { q, from, to, status } = await searchParams;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  let query = supabase
    .from("delivery_challans")
    .select("*")
    .order("dc_date", { ascending: false });

  if (from) query = query.gte("dc_date", from);
  if (to) query = query.lte("dc_date", to);
  if (status) query = query.eq("status", status as DcStatus);

  const [{ data }, { data: customersData }] = await Promise.all([
    query,
    supabase.from("customers").select("id, name"),
  ]);
  const customerMap = new Map((customersData ?? []).map((c) => [c.id, c.name]));
  let dcs = (data ?? []).map((dc) => ({ ...dc, customerName: customerMap.get(dc.customer_id) ?? null }));

  if (q) {
    const needle = q.toLowerCase();
    dcs = dcs.filter(
      (dc) =>
        dc.dc_number.toLowerCase().includes(needle) ||
        (dc.customerName ?? "").toLowerCase().includes(needle)
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Delivery Challans</h1>
          <p className="text-sm text-muted-foreground">{dcs.length} record(s)</p>
        </div>
        <Button render={<Link href="/dashboard/dc/new" />}>
          <Plus /> New DC
        </Button>
      </div>

      <DcFilters defaults={{ q, from, to, status }} />

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DC #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dcs.map((dc) => (
                <TableRow key={dc.id}>
                  <TableCell className="font-medium">{dc.dc_number}</TableCell>
                  <TableCell>{format(new Date(dc.dc_date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{dc.customerName ?? "-"}</TableCell>
                  <TableCell>
                    <DcStatusBadge status={dc.status} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button render={<Link href={`/dashboard/dc/${dc.id}`} />} variant="outline" size="sm">
                      View
                    </Button>
                    <Button
                      render={<Link href={`/dashboard/dc/${dc.id}/print`} />}
                      variant="outline"
                      size="sm"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dc_number} />}
                  </TableCell>
                </TableRow>
              ))}
              {dcs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No delivery challans found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {dcs.map((dc) => (
          <Card key={dc.id}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-start justify-between">
                <span className="font-medium">{dc.dc_number}</span>
                <DcStatusBadge status={dc.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {format(new Date(dc.dc_date), "dd MMM yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">
                {dc.customerName ?? "-"}
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  render={<Link href={`/dashboard/dc/${dc.id}`} />}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  View
                </Button>
                <Button render={<Link href={`/dashboard/dc/${dc.id}/print`} />} variant="outline" size="sm">
                  <Printer className="h-4 w-4" />
                </Button>
                {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dc_number} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {dcs.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No delivery challans found.</p>
        )}
      </div>
    </div>
  );
}

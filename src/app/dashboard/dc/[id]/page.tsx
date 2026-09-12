import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
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
import { balanceQty, findOverDelivered } from "@/lib/dc-balance";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { remainingByLine } from "@/lib/dc-chain";
import { dcLifecycle } from "@/lib/dc-lifecycle";
import { listRelatedDcs } from "@/lib/actions/dc-continuation";
import { DcStatusBadge } from "@/components/status-badge";
import { DcStatusActions } from "@/components/dc-status-actions";
import { DeleteDcButton } from "@/components/delete-dc-button";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { AlertTriangle, Pencil, Printer } from "lucide-react";

export const metadata: Metadata = { title: "Delivery Challan | Oviya Engineers" };

export default async function DcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  const { data: dc } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (!dc) notFound();

  const [{ data: items }, { data: customer }, { data: picklist }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);
  // The master list owns the spelling wherever a row carries a component id.
  const componentNames = componentNameIndex(picklist ?? []);

  // Despatches made on later challans have to be counted, or a line that has
  // been completed elsewhere still reads as outstanding here.
  const ownIds = (items ?? []).map((item) => item.id);
  const { data: continuations } =
    ownIds.length > 0
      ? await supabase.from("delivery_challan_items").select("*").in("parent_item_id", ownIds)
      : { data: [] };
  const remaining = remainingByLine([...(items ?? []), ...(continuations ?? [])]);

  const related = await listRelatedDcs(id);
  const overDelivered = findOverDelivered((items ?? []).filter((item) => !item.parent_item_id));
  const outstanding = [...remaining.values()].reduce((total, value) => total + value, 0);
  const lifecycle = dcLifecycle(dc.status, items ?? [], outstanding);

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={dc.dc_number} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dc.dc_number}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(dc.dc_date), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DcStatusBadge status={lifecycle} />
          <DcStatusActions id={dc.id} lifecycle={lifecycle} />
          <Button render={<Link href={`/dashboard/dc/${dc.id}/print`} />} variant="outline">
            <Printer className="h-4 w-4" /> Print
          </Button>
          {/* A completed challan is reconciled and often already invoiced, so
              editing it is behind Reopen rather than one tap away. */}
          {lifecycle !== "completed" && (
            <Button render={<Link href={`/dashboard/dc/${dc.id}/edit`} />} variant="outline">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dc_number} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {/* A line is printed only when there is something on it. A dash
                standing in for a missing phone number read as part of the
                address and left a gap above it. */}
            <p className="font-medium">{customer?.name ?? "-"}</p>
            {customer?.phone && <p className="text-muted-foreground">{customer.phone}</p>}
            {customer?.address && <p className="text-muted-foreground">{customer.address}</p>}
            {dc.customer_dc_number && dc.customer_dc_number.length > 0 ? (
              dc.customer_dc_number.map((num, i) => (
                <p key={i}>
                  Customer DC No: {num || "-"}
                  {dc.customer_dc_date?.[i]
                    ? ` (${format(new Date(dc.customer_dc_date[i] as string), "dd MMM yyyy")})`
                    : ""}
                </p>
              ))
            ) : (
              <p>Customer DC No: -</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Authorization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Authorized by: {dc.authorized_by ?? "-"}</p>
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
              <p key={row.position}>
                Row {row.position} — <span className="font-medium">{row.component}</span>: received{" "}
                {row.received}, accounted out {row.outward} —{" "}
                <span className="font-medium">{row.extra} extra.</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Material / Component Details</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Received Qty</TableHead>
                <TableHead>Sent Qty</TableHead>
                <TableHead>Material Problem</TableHead>
                <TableHead>Rejection</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => {
                const balance = remaining.get(item.id) ?? balanceQty(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>{componentNameOf(item, componentNames)}</TableCell>
                    <TableCell>{item.material ?? "-"}</TableCell>
                    <TableCell>{item.received_qty}</TableCell>
                    <TableCell>{item.sent_qty}</TableCell>
                    <TableCell>{item.material_problem_qty}</TableCell>
                    <TableCell>{item.rejection_qty}</TableCell>
                    <TableCell>{item.total_qty}</TableCell>
                    <TableCell
                      className={
                        balance < 0
                          ? "font-medium text-destructive"
                          : balance > 0
                            ? "text-amber-600"
                            : "text-muted-foreground"
                      }
                    >
                      {balance < 0 ? `${balance} extra` : balance > 0 ? `${balance} pending` : "0"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {related.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[#10233f]">
              Completed by {new Set(related.map((row) => row.dcNumber)).size} later challan
              {new Set(related.map((row) => row.dcNumber)).size === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>DC</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Mat. Problem</TableHead>
                  <TableHead className="text-right">Rejection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {related.map((row, index) => (
                  <TableRow key={`${row.dcId}-${index}`}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/dc/${row.dcId}`} className="hover:underline">
                        {row.dcNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.dcDate ? format(new Date(row.dcDate), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell>{row.component}</TableCell>
                    <TableCell className="text-right">{row.sent}</TableCell>
                    <TableCell className="text-right">{row.materialProblem}</TableCell>
                    <TableCell className="text-right">{row.rejection}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={3}>Total completed against this challan</TableCell>
                  <TableCell className="text-right">
                    {related.reduce((total, row) => total + row.sent, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {related.reduce((total, row) => total + row.materialProblem, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {related.reduce((total, row) => total + row.rejection, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="text-sm font-medium">Sent after machining</CardContent>
      </Card>
    </div>
  );
}

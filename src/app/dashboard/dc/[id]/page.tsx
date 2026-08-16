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
import { DcStatusBadge } from "@/components/status-badge";
import { DcStatusActions } from "@/components/dc-status-actions";
import { DeleteDcButton } from "@/components/delete-dc-button";
import { Pencil, Printer } from "lucide-react";

export const metadata: Metadata = { title: "Delivery Challan | Oviya Engineers" };

export default async function DcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  const { data: dc } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (!dc) notFound();

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
    supabase.from("customers").select("*").eq("id", dc.customer_id).single(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dc.dc_number}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(dc.dc_date), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DcStatusBadge status={dc.status} />
          <DcStatusActions id={dc.id} status={dc.status} />
          <Button render={<Link href={`/dashboard/dc/${dc.id}/print`} />} variant="outline">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button render={<Link href={`/dashboard/dc/${dc.id}/edit`} />} variant="outline">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {isAdmin && <DeleteDcButton id={dc.id} dcNumber={dc.dc_number} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{customer?.name ?? "-"}</p>
            <p className="text-muted-foreground">{customer?.phone ?? "-"}</p>
            <p className="text-muted-foreground">{customer?.address ?? "-"}</p>
            <p>Customer DC No: {dc.customer_dc_number ?? "-"}</p>
            <p>
              Customer DC Date:{" "}
              {dc.customer_dc_date ? format(new Date(dc.customer_dc_date), "dd MMM yyyy") : "-"}
            </p>
            <p>Job Order / PO No: {dc.job_order_no ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transport</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Vehicle: {dc.vehicle_number ?? "-"}</p>
            <p>Driver: {dc.driver_name ?? "-"}</p>
            <p>Authorized by: {dc.authorized_by ?? "-"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Material / Component Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Received Qty</TableHead>
                <TableHead>Sent Qty</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.component}</TableCell>
                  <TableCell>{item.material ?? "-"}</TableCell>
                  <TableCell>{item.received_qty}</TableCell>
                  <TableCell>{item.sent_qty}</TableCell>
                  <TableCell>{item.balance}</TableCell>
                  <TableCell>{item.remarks ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dc.remarks && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remarks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{dc.remarks}</CardContent>
        </Card>
      )}
    </div>
  );
}

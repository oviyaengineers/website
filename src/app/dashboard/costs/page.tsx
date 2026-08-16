import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CostForm } from "@/components/cost-form";
import { DeleteCostButton } from "@/components/delete-cost-button";
import { createCostAction } from "@/lib/actions/costs";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Job Costs | Oviya Engineers" };

export default async function CostsPage() {
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  const [{ data: costs }, { data: dcs }, { data: invoices }] = await Promise.all([
    supabase.from("job_costs").select("*").order("created_at", { ascending: false }),
    supabase.from("delivery_challans").select("id, dc_number").order("dc_date", { ascending: false }),
    supabase.from("invoices").select("id, invoice_number").order("invoice_date", { ascending: false }),
  ]);

  const dcMap = new Map((dcs ?? []).map((d) => [d.id, d.dc_number]));
  const invMap = new Map((invoices ?? []).map((i) => [i.id, i.invoice_number]));
  const totalCost = (costs ?? []).reduce((sum, c) => sum + Number(c.total_cost), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Job Costs</h1>
        <p className="text-sm text-muted-foreground">
          Log material, machine, labor, tooling, and overhead costs per job.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Cost Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <CostForm dcs={dcs ?? []} invoices={invoices ?? []} action={createCostAction} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Total Logged Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(costs ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.job_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.dc_id && dcMap.get(c.dc_id)}
                        {c.dc_id && c.invoice_id && " · "}
                        {c.invoice_id && invMap.get(c.invoice_id)}
                        {!c.dc_id && !c.invoice_id && "-"}
                      </TableCell>
                      <TableCell>₹{Number(c.total_cost).toLocaleString("en-IN")}</TableCell>
                      <TableCell>{format(new Date(c.created_at), "dd MMM yyyy")}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <DeleteCostButton id={c.id} jobName={c.job_name} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(!costs || costs.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                        No cost entries yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

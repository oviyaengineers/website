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
import { Plus } from "lucide-react";
import { CustomerSearch } from "@/components/customer-search";
import { DeleteCustomerButton } from "@/components/delete-customer-button";

export const metadata: Metadata = { title: "Customers | Oviya Engineers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const { profile } = await getCurrentUserAndProfile();
  const isAdmin = profile?.role === "admin";

  let query = supabase.from("customers").select("*").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: customers } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers?.length ?? 0} customer(s)
          </p>
        </div>
        <Button render={<Link href="/dashboard/customers/new" />}>
          <Plus /> New Customer
        </Button>
      </div>

      <CustomerSearch defaultValue={q ?? ""} />

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>GST No.</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(customers ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.contact_person ?? "-"}</TableCell>
                  <TableCell>{c.phone ?? "-"}</TableCell>
                  <TableCell>{c.email ?? "-"}</TableCell>
                  <TableCell>{c.gst_number ?? "-"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      render={<Link href={`/dashboard/customers/${c.id}/edit`} />}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                    {isAdmin && <DeleteCustomerButton id={c.id} name={c.name} />}
                  </TableCell>
                </TableRow>
              ))}
              {(!customers || customers.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No customers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {(customers ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-start justify-between">
                <span className="font-medium">{c.name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{c.contact_person ?? "-"}</p>
              <p className="text-sm text-muted-foreground">{c.phone ?? "-"}</p>
              <p className="text-sm text-muted-foreground">{c.email ?? "-"}</p>
              <div className="flex gap-2 pt-2">
                <Button
                  render={<Link href={`/dashboard/customers/${c.id}/edit`} />}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Edit
                </Button>
                {isAdmin && <DeleteCustomerButton id={c.id} name={c.name} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {(!customers || customers.length === 0) && (
          <p className="text-center text-muted-foreground py-8">No customers found.</p>
        )}
      </div>
    </div>
  );
}

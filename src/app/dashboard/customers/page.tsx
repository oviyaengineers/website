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
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("customers.title")} | Oviya Engineers` };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const [{ profile }, { t }] = await Promise.all([getCurrentUserAndProfile(), getTranslator()]);
  const isAdmin = profile?.role === "admin";

  let query = supabase.from("customers").select("*").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: customers } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("customers.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("customers.count", { count: customers?.length ?? 0 })}
          </p>
        </div>
        <Button render={<Link href="/dashboard/customers/new" />}>
          <Plus /> {t("customers.newCustomer")}
        </Button>
      </div>

      <CustomerSearch defaultValue={q ?? ""} />

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customers.name")}</TableHead>
                <TableHead>{t("customers.contactPerson")}</TableHead>
                <TableHead>{t("customers.phone")}</TableHead>
                <TableHead>{t("customers.email")}</TableHead>
                <TableHead>{t("customers.gstNo")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                      {t("common.edit")}
                    </Button>
                    {isAdmin && <DeleteCustomerButton id={c.id} name={c.name} />}
                  </TableCell>
                </TableRow>
              ))}
              {(!customers || customers.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("customers.none")}
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
                  {t("common.edit")}
                </Button>
                {isAdmin && <DeleteCustomerButton id={c.id} name={c.name} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {(!customers || customers.length === 0) && (
          <p className="text-center text-muted-foreground py-8">{t("customers.none")}</p>
        )}
      </div>
    </div>
  );
}

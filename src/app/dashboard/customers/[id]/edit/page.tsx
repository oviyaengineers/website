import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "@/components/customer-form";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { updateCustomerAction } from "@/lib/actions/customers";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("customers.editTitle")} | Oviya Engineers` };
}

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: customer }, { t }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    getTranslator(),
  ]);

  if (!customer) notFound();

  const boundAction = updateCustomerAction.bind(null, id);

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={customer.name} />
      <div>
        <h1 className="text-2xl font-semibold">{t("customers.editTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("customers.editIntro", { name: customer.name })}
        </p>
      </div>
      <CustomerForm customer={customer} action={boundAction} />
    </div>
  );
}

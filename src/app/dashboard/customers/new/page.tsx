import type { Metadata } from "next";
import { CustomerForm } from "@/components/customer-form";
import { createCustomerAction } from "@/lib/actions/customers";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("customers.newCustomer")} | Oviya Engineers` };
}

export default async function NewCustomerPage() {
  const { t } = await getTranslator();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("customers.newCustomer")}</h1>
        <p className="text-sm text-muted-foreground">{t("customers.newIntro")}</p>
      </div>
      <CustomerForm action={createCustomerAction} />
    </div>
  );
}

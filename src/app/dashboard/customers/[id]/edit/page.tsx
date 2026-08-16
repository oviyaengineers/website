import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomerAction } from "@/lib/actions/customers";

export const metadata: Metadata = { title: "Edit Customer | Oviya Engineers" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).single();

  if (!customer) notFound();

  const boundAction = updateCustomerAction.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit Customer</h1>
        <p className="text-sm text-muted-foreground">Update {customer.name}&apos;s details.</p>
      </div>
      <CustomerForm customer={customer} action={boundAction} />
    </div>
  );
}

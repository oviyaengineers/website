import type { Metadata } from "next";
import { CustomerForm } from "@/components/customer-form";
import { createCustomerAction } from "@/lib/actions/customers";

export const metadata: Metadata = { title: "New Customer | Oviya Engineers" };

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Customer</h1>
        <p className="text-sm text-muted-foreground">Add a new customer record.</p>
      </div>
      <CustomerForm action={createCustomerAction} />
    </div>
  );
}

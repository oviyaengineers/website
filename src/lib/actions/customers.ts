"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/server";

export type CustomerFormState = { error: string | null };

function extractCustomer(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    contact_person: (formData.get("contact_person") as string) || null,
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
    address: (formData.get("address") as string) || null,
    gst_number:
      String(formData.get("gst_number") ?? "")
        .trim()
        .toUpperCase() || null,
    state: String(formData.get("state") ?? "").trim() || null,
  };
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const supabase = await createClient();
  const values = extractCustomer(formData);

  if (!values.name) {
    return { error: (await getTranslator()).t("customers.nameRequiredError") };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("customers")
    .insert({ ...values, created_by: user?.id ?? null });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}

export async function updateCustomerAction(
  id: string,
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const supabase = await createClient();
  const values = extractCustomer(formData);

  if (!values.name) {
    return { error: (await getTranslator()).t("customers.nameRequiredError") };
  }

  const { error } = await supabase.from("customers").update(values).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}

export async function deleteCustomerAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/customers");
}

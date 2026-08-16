"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/types/database";

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type InvoiceFormValues = {
  customer_id: string;
  dc_id: string | null;
  invoice_date: string;
  due_date: string | null;
  gst_rate: number;
  discount: number;
  notes: string | null;
  items: InvoiceItemInput[];
};

export type InvoiceFormState = { error: string | null };

function parseInvoiceForm(formData: FormData): InvoiceFormValues {
  const customer_id = String(formData.get("customer_id") ?? "");
  const dc_id = (formData.get("dc_id") as string) || null;
  const invoice_date = String(formData.get("invoice_date") ?? "");
  const due_date = (formData.get("due_date") as string) || null;
  const gst_rate = Number(formData.get("gst_rate") ?? 18) || 0;
  const discount = Number(formData.get("discount") ?? 0) || 0;
  const notes = (formData.get("notes") as string) || null;

  const descriptions = formData.getAll("item_description") as string[];
  const quantities = formData.getAll("item_quantity") as string[];
  const units = formData.getAll("item_unit") as string[];
  const prices = formData.getAll("item_unit_price") as string[];

  const items: InvoiceItemInput[] = descriptions
    .map((description, i) => ({
      description: description?.trim() ?? "",
      quantity: Number(quantities[i] ?? 1) || 1,
      unit: units[i]?.trim() || "nos",
      unit_price: Number(prices[i] ?? 0) || 0,
    }))
    .filter((item) => item.description.length > 0);

  return { customer_id, dc_id, invoice_date, due_date, gst_rate, discount, notes, items };
}

function computeTotals(values: InvoiceFormValues) {
  const subtotal = values.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const gst_amount = (subtotal * values.gst_rate) / 100;
  const grand_total = subtotal + gst_amount - values.discount;
  return { subtotal, gst_amount, grand_total };
}

export async function createInvoiceAction(
  _prevState: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const values = parseInvoiceForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one line item." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { subtotal, gst_amount, grand_total } = computeTotals(values);

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      customer_id: values.customer_id,
      dc_id: values.dc_id,
      invoice_date: values.invoice_date || undefined,
      due_date: values.due_date,
      subtotal,
      gst_rate: values.gst_rate,
      gst_amount,
      discount: values.discount,
      grand_total,
      notes: values.notes,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (invError || !invoice) {
    return { error: invError?.message ?? "Failed to create invoice." };
  }

  const { error: itemsError } = await supabase.from("invoice_items").insert(
    values.items.map((item, index) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      amount: item.quantity * item.unit_price,
      sort_order: index,
    }))
  );

  if (itemsError) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return { error: itemsError.message };
  }

  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${invoice.id}`);
}

export async function updateInvoiceAction(
  id: string,
  _prevState: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const values = parseInvoiceForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one line item." };

  const supabase = await createClient();
  const { subtotal, gst_amount, grand_total } = computeTotals(values);

  const { error: invError } = await supabase
    .from("invoices")
    .update({
      customer_id: values.customer_id,
      dc_id: values.dc_id,
      invoice_date: values.invoice_date || undefined,
      due_date: values.due_date,
      subtotal,
      gst_rate: values.gst_rate,
      gst_amount,
      discount: values.discount,
      grand_total,
      notes: values.notes,
    })
    .eq("id", id);

  if (invError) return { error: invError.message };

  const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (deleteError) return { error: deleteError.message };

  const { error: itemsError } = await supabase.from("invoice_items").insert(
    values.items.map((item, index) => ({
      invoice_id: id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      amount: item.quantity * item.unit_price,
      sort_order: index,
    }))
  );

  if (itemsError) return { error: itemsError.message };

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${id}`);
  redirect(`/dashboard/invoices/${id}`);
}

export async function updatePaymentStatusAction(
  id: string,
  payment_status: PaymentStatus,
  amount_paid: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ payment_status, amount_paid })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reports/outstanding");
}

export async function deleteInvoiceAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/invoices");
}

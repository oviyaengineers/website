"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { invoiceErrorMessage } from "@/lib/invoice-save-errors";
import { moduleLockedError } from "@/lib/module-lock-server";
import type { PaymentStatus } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IssueInvoiceState = { error: string | null };

export type IssueInvoicePayload = {
  customer_id: string;
  /** The calendar month billed, as its first day. */
  billing_month: string;
  invoice_date: string;
  due_date: string | null;
  /** GST Bill ON or OFF, chosen for this invoice. */
  gst_bill: boolean;
  gst_rate: number | null;
  discount: number;
  notes: string | null;
  lines: { dc_item_id: string; quantity: number; rate: number; hsn_sac: string | null }[];
  charges: { description: string; amount: number; hsn_sac: string | null }[];
};

function revalidateBilling(invoiceId?: string) {
  for (const path of [
    "/dashboard/invoices",
    "/dashboard/invoices/unbilled",
    "/dashboard/reports/outstanding",
    "/dashboard",
    "/dashboard/dc",
  ]) {
    revalidatePath(path);
  }
  if (invoiceId) revalidatePath(`/dashboard/invoices/${invoiceId}`);
}

/**
 * Creates an invoice for one customer and billing month through
 * create_invoice, which locks the DC lines, checks each quantity against what
 * is still unbilled, groups the lines and writes their allocations in one
 * transaction. The figures sent from the form are only the operator's
 * choices; availability, totals and tax are worked out again in the database.
 */
export async function issueInvoiceAction(
  _prev: IssueInvoiceState,
  formData: FormData
): Promise<IssueInvoiceState> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  let payload: IssueInvoicePayload;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The invoice could not be read. Reload the page and try again." };
  }
  const requestKey = String(formData.get("request_key") ?? "");
  if (!UUID.test(requestKey)) {
    return { error: "The form is still loading. Wait a moment and try again." };
  }
  if (!payload.customer_id) return { error: "Select the customer to bill." };
  if (!/^\d{4}-\d{2}-01$/.test(payload.billing_month ?? "")) {
    return { error: "Select the billing month." };
  }
  if (typeof payload.gst_bill !== "boolean") {
    return { error: "Choose GST Bill ON or OFF for this invoice." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_request_key: requestKey,
    p_customer_id: payload.customer_id,
    p_billing_month: payload.billing_month,
    p_header: {
      invoice_date: payload.invoice_date,
      due_date: payload.due_date ?? "",
      gst_bill: payload.gst_bill,
      gst_rate:
        !payload.gst_bill || payload.gst_rate === null || Number.isNaN(payload.gst_rate)
          ? ""
          : payload.gst_rate,
      discount: payload.discount || 0,
      notes: payload.notes ?? "",
    },
    p_lines: payload.lines,
    p_charges: payload.charges,
  });
  if (error) return { error: invoiceErrorMessage(error.message, error.code) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_id) return { error: invoiceErrorMessage("The save returned no invoice.") };

  revalidateBilling(row.invoice_id);
  redirect(`/dashboard/invoices/${row.invoice_id}`);
}

/** Cancels an issued invoice. Its number stays; its billed quantity is freed. */
export async function cancelInvoiceAction(
  invoiceId: string,
  reason: string
): Promise<{ error: string | null }> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  if (!reason.trim()) return { error: "Give a reason for cancelling the invoice." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
  });
  if (error) return { error: invoiceErrorMessage(error.message, error.code) };
  revalidateBilling(invoiceId);
  return { error: null };
}

/** Records a payment. The only change an issued invoice accepts directly. */
export async function updatePaymentAction(
  invoiceId: string,
  status: PaymentStatus,
  amountPaid: number
): Promise<{ error: string | null }> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  if (!["unpaid", "partial", "paid"].includes(status)) return { error: "Choose a payment status." };
  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    return { error: "The amount paid cannot be negative." };
  }
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("grand_total")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "That invoice no longer exists." };
  if (amountPaid > Number(invoice.grand_total)) {
    return { error: "The amount paid cannot be more than the grand total." };
  }
  const { data, error } = await supabase
    .from("invoices")
    .update({ payment_status: status, amount_paid: amountPaid })
    .eq("id", invoiceId)
    .select("id");
  if (error) return { error: invoiceErrorMessage(error.message, error.code) };
  if (!data || data.length === 0) return { error: "Nothing was saved." };
  revalidateBilling(invoiceId);
  return { error: null };
}

export type SettingsFormState = { error: string | null; saved?: boolean };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

/** Seller details, bank details and billing defaults. Admin only (RLS). */
export async function saveCompanySettingsAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  const rateText = text(formData, "default_gst_rate");
  const rate = rateText === null ? null : Number(rateText);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
    return { error: "The default GST rate must be between 0 and 100." };
  }
  const gstin = text(formData, "gstin")?.toUpperCase() ?? null;
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return { error: "A GSTIN is 15 letters and digits. Check it and save again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("company_billing_settings")
    .update({
      legal_name: text(formData, "legal_name"),
      address: text(formData, "address"),
      state: text(formData, "state"),
      gstin,
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      bank_name: text(formData, "bank_name"),
      bank_account_name: text(formData, "bank_account_name"),
      bank_account_number: text(formData, "bank_account_number"),
      bank_ifsc: text(formData, "bank_ifsc")?.toUpperCase() ?? null,
      bank_branch: text(formData, "bank_branch"),
      default_hsn_sac: text(formData, "default_hsn_sac"),
      default_gst_rate: rate,
      payment_terms: text(formData, "payment_terms"),
      authorized_signatory: text(formData, "authorized_signatory"),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing was saved. Only an admin can change billing details." };
  }
  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/invoices/new");
  return { error: null, saved: true };
}

/**
 * Where one series goes next: GST tax invoices or normal bills. Issued numbers
 * are never rewritten, and the database keeps the two prefixes different so
 * the series can never produce the same number.
 */
export async function saveInvoiceSeriesAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "gst" && kind !== "non_gst") return { error: "Choose which series to change." };
  const prefix = String(formData.get("prefix") ?? "")
    .trim()
    .toUpperCase();
  const fyLabel = String(formData.get("fy_label") ?? "").trim();
  const padding = Number(formData.get("padding") ?? 3);
  const nextSerial = Number(formData.get("next_serial") ?? 1);
  if (!fyLabel || !/^[A-Za-z0-9-]{2,12}$/.test(fyLabel)) {
    return { error: "Enter the financial year, for example 26-27." };
  }
  if (!/^[A-Z]{1,10}\/$/.test(prefix)) {
    return { error: "The prefix is 1 to 10 capital letters followed by /, for example BILL/." };
  }
  if (!Number.isInteger(padding) || padding < 1 || padding > 8) {
    return { error: "Serial digits must be between 1 and 8." };
  }
  if (!Number.isInteger(nextSerial) || nextSerial < 1) {
    return { error: "The next serial must be 1 or more." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("invoice_number_series")
    .update({
      prefix,
      fy_label: fyLabel,
      padding,
      next_serial: nextSerial,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq("kind", kind)
    .select("kind");
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "GST invoices and normal bills need different prefixes, so their numbers never overlap."
          : error.message,
    };
  }
  if (!data || data.length === 0) {
    return { error: "Nothing was saved. Only an admin can change invoice numbering." };
  }
  revalidatePath("/dashboard/settings/invoice-numbers");
  revalidatePath("/dashboard/invoices/new");
  return { error: null, saved: true };
}

/** Adds or updates one Rate List entry for a component and material. Admin only. */
export async function saveRateAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  const componentId = String(formData.get("component_id") ?? "");
  const material = String(formData.get("material") ?? "").trim();
  const rate = Number(formData.get("rate"));
  const hsn = text(formData, "hsn_sac");
  if (!UUID.test(componentId)) return { error: "Choose the component." };
  if (!Number.isFinite(rate) || rate < 0 || String(formData.get("rate") ?? "").trim() === "") {
    return { error: "Enter a rate of zero or more." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("component_rates")
    .upsert(
      {
        component_id: componentId,
        material,
        rate,
        hsn_sac: hsn,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "component_id,material" }
    )
    .select("id");
  if (error) {
    return {
      error: /row-level security|42501/i.test(error.message + (error.code ?? ""))
        ? "Only an admin can change the Rate List."
        : error.message,
    };
  }
  if (!data || data.length === 0) return { error: "Nothing was saved." };
  revalidatePath("/dashboard/settings/rates");
  revalidatePath("/dashboard/invoices/new");
  return { error: null, saved: true };
}

/** Removes a Rate List entry. Invoices already issued keep the rate they used. */
export async function deleteRateAction(id: string): Promise<{ error: string | null }> {
  // Billing sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("billing");
  if (locked) return { error: locked };
  const supabase = await createClient();
  const { data, error } = await supabase.from("component_rates").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { error: "Nothing was removed. Only an admin can do this." };
  revalidatePath("/dashboard/settings/rates");
  return { error: null };
}

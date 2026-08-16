"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DcStatus } from "@/types/database";

export type DcItemInput = {
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  remarks: string | null;
};

export type DcFormValues = {
  customer_id: string;
  dc_date: string;
  customer_dc_number: string | null;
  customer_dc_date: string | null;
  job_order_no: string | null;
  vehicle_number: string | null;
  authorized_by: string | null;
  remarks: string | null;
  items: DcItemInput[];
};

export type DcFormState = { error: string | null };

function parseDcForm(formData: FormData): DcFormValues {
  const customer_id = String(formData.get("customer_id") ?? "");
  const dc_date = String(formData.get("dc_date") ?? "");
  const customer_dc_number = (formData.get("customer_dc_number") as string) || null;
  const customer_dc_date = (formData.get("customer_dc_date") as string) || null;
  const job_order_no = (formData.get("job_order_no") as string) || null;
  const vehicle_number = (formData.get("vehicle_number") as string) || null;
  const authorized_by = (formData.get("authorized_by") as string) || null;
  const remarks = (formData.get("remarks") as string) || null;

  const components = formData.getAll("item_component") as string[];
  const materials = formData.getAll("item_material") as string[];
  const receivedQtys = formData.getAll("item_received_qty") as string[];
  const sentQtys = formData.getAll("item_sent_qty") as string[];
  const materialProblemQtys = formData.getAll("item_material_problem_qty") as string[];
  const rejectionQtys = formData.getAll("item_rejection_qty") as string[];
  const itemRemarks = formData.getAll("item_remarks") as string[];

  const items: DcItemInput[] = components
    .map((component, i) => ({
      component: component?.trim() ?? "",
      material: materials[i]?.trim() || null,
      received_qty: Number(receivedQtys[i] ?? 0) || 0,
      sent_qty: Number(sentQtys[i] ?? 0) || 0,
      material_problem_qty: Number(materialProblemQtys[i] ?? 0) || 0,
      rejection_qty: Number(rejectionQtys[i] ?? 0) || 0,
      remarks: itemRemarks[i]?.trim() || null,
    }))
    .filter((item) => item.component.length > 0);

  return {
    customer_id,
    dc_date,
    customer_dc_number,
    customer_dc_date,
    job_order_no,
    vehicle_number,
    authorized_by,
    remarks,
    items,
  };
}

export async function createDcAction(
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one item." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: dc, error: dcError } = await supabase
    .from("delivery_challans")
    .insert({
      customer_id: values.customer_id,
      dc_date: values.dc_date || undefined,
      customer_dc_number: values.customer_dc_number,
      customer_dc_date: values.customer_dc_date,
      job_order_no: values.job_order_no,
      vehicle_number: values.vehicle_number,
      authorized_by: values.authorized_by,
      remarks: values.remarks,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (dcError || !dc) {
    return { error: dcError?.message ?? "Failed to create delivery challan." };
  }

  const { error: itemsError } = await supabase.from("delivery_challan_items").insert(
    values.items.map((item, index) => ({
      dc_id: dc.id,
      component: item.component,
      material: item.material,
      received_qty: item.received_qty,
      sent_qty: item.sent_qty,
      material_problem_qty: item.material_problem_qty,
      rejection_qty: item.rejection_qty,
      remarks: item.remarks,
      sort_order: index,
    }))
  );

  if (itemsError) {
    // Partial failure: remove the orphaned DC header so we don't leave a
    // delivery challan with no items behind.
    await supabase.from("delivery_challans").delete().eq("id", dc.id);
    return { error: itemsError.message };
  }

  revalidatePath("/dashboard/dc");
  redirect(`/dashboard/dc/${dc.id}`);
}

export async function updateDcAction(
  id: string,
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one item." };

  const supabase = await createClient();

  const { error: dcError } = await supabase
    .from("delivery_challans")
    .update({
      customer_id: values.customer_id,
      dc_date: values.dc_date || undefined,
      customer_dc_number: values.customer_dc_number,
      customer_dc_date: values.customer_dc_date,
      job_order_no: values.job_order_no,
      vehicle_number: values.vehicle_number,
      authorized_by: values.authorized_by,
      remarks: values.remarks,
    })
    .eq("id", id);

  if (dcError) return { error: dcError.message };

  const { error: deleteError } = await supabase
    .from("delivery_challan_items")
    .delete()
    .eq("dc_id", id);

  if (deleteError) return { error: deleteError.message };

  const { error: itemsError } = await supabase.from("delivery_challan_items").insert(
    values.items.map((item, index) => ({
      dc_id: id,
      component: item.component,
      material: item.material,
      received_qty: item.received_qty,
      sent_qty: item.sent_qty,
      material_problem_qty: item.material_problem_qty,
      rejection_qty: item.rejection_qty,
      remarks: item.remarks,
      sort_order: index,
    }))
  );

  if (itemsError) return { error: itemsError.message };

  revalidatePath("/dashboard/dc");
  revalidatePath(`/dashboard/dc/${id}`);
  redirect(`/dashboard/dc/${id}`);
}

export async function updateDcStatusAction(id: string, status: DcStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_challans").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/dc/${id}`);
  revalidatePath("/dashboard/dc");
}

export async function deleteDcAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_challans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/dc");
}

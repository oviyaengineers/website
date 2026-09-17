"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(redirectTo || "/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  // Billing and Weight / Scrap lock again at once, on every device, before the
  // session ends. Signing out ends the session too, which alone would stop the
  // unlock counting; this makes it immediate and explicit.
  await supabase.rpc("lock_modules");
  await supabase.auth.signOut();
  redirect("/auth/login");
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A database client with the service role, for the server only.
 *
 * Used for exactly one job: issuing a security code (issue_security_otp,
 * migration 0030), which returns the code so the server can email it. That
 * function is closed to the browser roles on purpose. The key is read from a
 * server-only environment variable, never a NEXT_PUBLIC_ one, and this module
 * refuses to run in a browser.
 */
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("The service client is server-only.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

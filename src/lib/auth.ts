import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export async function getCurrentUserAndProfile(): Promise<{
  user: { id: string; email: string | null } | null;
  profile: ProfileRow | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile ?? null,
  };
}

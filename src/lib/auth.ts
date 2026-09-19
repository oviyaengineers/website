import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

/**
 * The signed-in user and their profile, looked up once per page load.
 *
 * The dashboard layout and most pages both ask, and each ask was a round trip
 * to Supabase Auth plus a profile query. React's cache() shares the answer
 * within one server request only: nothing is kept between requests or users.
 */
export const getCurrentUserAndProfile = cache(
  async (): Promise<{
    user: { id: string; email: string | null } | null;
    profile: ProfileRow | null;
  }> => {
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
);

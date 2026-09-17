import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/server";
import type { LockedModule } from "@/lib/module-lock";

/**
 * Whether this session has the module unlocked, counting as activity so the
 * 15-minute idle timer restarts. Server only; the database decides.
 */
export async function touchModuleUnlock(module: LockedModule): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("touch_module_unlock", { p_module: module });
  return !error && data === true;
}

/** Whether the module is unlocked, without counting as activity. */
export async function isModuleUnlocked(module: LockedModule): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("module_unlocked", { p_module: module });
  return !error && data === true;
}

/**
 * For a server action of a locked module: null when it may run, otherwise the
 * message to return. The database refuses the data anyway; this makes the
 * refusal a clear sentence instead of an empty result.
 */
export async function moduleLockedError(module: LockedModule): Promise<string | null> {
  if (await touchModuleUnlock(module)) return null;
  const { t } = await getTranslator();
  return t("security.moduleLockedError");
}

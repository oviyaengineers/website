import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { moduleForPath, unlockPathFor } from "@/lib/module-lock";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Billing and Weight / Scrap sit behind the 4-digit PIN (migration 0030).
  // Checked here, before any page renders, because layouts do not re-render
  // between pages and would miss an unlock that expired meanwhile. A page
  // load counts as activity; a link prefetch only looks, so a menu link
  // sitting on screen cannot keep a module unlocked. Server actions (POST)
  // check for themselves, and the database refuses the data regardless.
  const lockedModule = user ? moduleForPath(pathname) : null;
  if (lockedModule && (request.method === "GET" || request.method === "HEAD")) {
    const prefetch =
      request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
    const { data: unlocked } = await supabase.rpc(
      prefetch ? "module_unlocked" : "touch_module_unlock",
      { p_module: lockedModule }
    );
    if (unlocked !== true) {
      const url = new URL(
        unlockPathFor(lockedModule, `${pathname}${request.nextUrl.search}`),
        request.url
      );
      const redirect = NextResponse.redirect(url);
      // Keep any session cookies the auth refresh just set.
      supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return supabaseResponse;
}

import type { NextRequest } from "next/server";
import { allowedPrintPage } from "@/lib/print/allowed-print-paths";

export const dynamic = "force-dynamic";

/** Keep old preview links on the actual print page, not a wrapper page. */
export async function GET(request: NextRequest) {
  const page = allowedPrintPage(request.nextUrl.searchParams.get("path"));
  if (!page) {
    return new Response("This page cannot be printed.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return Response.redirect(new URL(page.path, request.nextUrl.origin), 307);
}

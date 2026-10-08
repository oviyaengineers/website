import type { NextRequest } from "next/server";
import { allowedPrintPage } from "@/lib/print/allowed-print-paths";

export const dynamic = "force-dynamic";

/** Route legacy mobile preview URLs to the clean PDF, never to printable HTML. */
export async function GET(request: NextRequest) {
  const page = allowedPrintPage(request.nextUrl.searchParams.get("path"));
  if (!page) {
    return new Response("This page cannot be printed.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const pdfParams = new URLSearchParams({ path: page.path });
  const destination = new URL(`/api/print/pdf?${pdfParams.toString()}`, request.nextUrl.origin);
  return Response.redirect(destination, 307);
}

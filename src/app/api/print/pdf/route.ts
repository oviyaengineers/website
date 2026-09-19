import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedPrintPage, pdfFileName } from "@/lib/print/allowed-print-paths";

/**
 * Every ERP printout as a clean PDF.
 *
 * Printing a web page lets the browser add its own header and footer: the
 * page URL, the date and time, "Page 1 of 2". Chrome can be talked out of it,
 * but iPhone and iPad Safari always print them, and no CSS turns them off. A
 * PDF printed from the phone's PDF viewer carries only its own pages.
 *
 * So the print page the user is looking at is opened by a browser on the
 * server, as that same signed-in user (their own cookies, so every permission
 * and the Billing / Weight PIN still apply), and printed to PDF with the
 * browser header and footer switched off and the page's own A4 setup obeyed.
 * The document is exactly the page on screen: same layout, numbers and QR.
 *
 * Only the pages in allowed-print-paths.ts can be rendered, on this site only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FONT_DIR = path.join(process.cwd(), "src", "lib", "print", "fonts");

/**
 * The print pages set their Latin text in the reader's Times New Roman. The
 * server's browser has no such font, so Liberation Serif, which has exactly
 * the same letter widths, stands in under that name. The layout is therefore
 * identical, line for line, to what the reader's own browser prints.
 */
let fontCss: Promise<string> | null = null;
function serifFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const faces: [string, string, string][] = [
      ["LiberationSerif-Regular.ttf", "normal", "400"],
      ["LiberationSerif-Bold.ttf", "normal", "700"],
      ["LiberationSerif-Italic.ttf", "italic", "400"],
      ["LiberationSerif-BoldItalic.ttf", "italic", "700"],
    ];
    const rules = await Promise.all(
      faces.map(async ([file, style, weight]) => {
        const data = (await readFile(path.join(FONT_DIR, file))).toString("base64");
        return `@font-face{font-family:"Times New Roman";font-style:${style};font-weight:${weight};src:url(data:font/ttf;base64,${data}) format("truetype");}`;
      })
    );
    return `${rules.join("")}:root{font-family:"Times New Roman",serif;}`;
  })();
  fontCss.catch(() => {
    fontCss = null;
  });
  return fontCss;
}

/** The server browser: the packaged Chromium on Vercel, the installed Chrome elsewhere. */
async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });
  }
  const local =
    process.env.PRINT_CHROME_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/google-chrome");
  return puppeteer.launch({ executablePath: local, headless: true });
}

function message(status: number, text: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print</title><p style="font:16px system-ui;margin:2rem">${text}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const page = allowedPrintPage(request.nextUrl.searchParams.get("path"));
  if (!page) return message(400, "This page cannot be printed.");

  // Refreshes the session first if it is about to expire, so the server
  // browser and the reader's own browser go on with the same, current cookies.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return message(401, "Please sign in again, then print.");

  const origin = request.nextUrl.origin;
  const target = new URL(page.path, origin);
  const jar = (await cookies()).getAll();

  const browser = await launchBrowser();
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1240, height: 1754 });
    await browser.setCookie(
      ...jar.map((c) => ({
        name: c.name,
        value: c.value,
        domain: target.hostname,
        path: "/",
        secure: target.protocol === "https:",
        httpOnly: false,
      }))
    );
    const css = await serifFontCss();
    await tab.evaluateOnNewDocument((styles: string) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = styles;
        document.head.appendChild(style);
      });
    }, css);

    const response = await tab.goto(target.toString(), {
      waitUntil: "networkidle0",
      timeout: 45_000,
    });
    const landed = new URL(tab.url());
    if (landed.pathname !== target.pathname) {
      // Sent elsewhere by the app: the login page, or a module that is locked.
      return message(
        403,
        landed.pathname.startsWith("/dashboard/unlock")
          ? "This document is locked. Unlock it with your PIN, then print again."
          : "Please sign in again, then print."
      );
    }
    if (!response || !response.ok()) return message(404, "This document could not be found.");

    await tab.evaluate(async () => {
      await document.fonts.ready;
      // Let the page's own fit check measure the final layout.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    const pdf = await tab.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      // The whole point: no URL, date/time or page number from the browser.
      displayHeaderFooter: false,
    });
    // Named after the document: its page title, or for a challan (whose title
    // is just the company) the kind and the first number on the sheet.
    const title = await tab.title();
    const firstNumber = await tab.evaluate(
      () => document.querySelector(".dc-print-cell-value")?.textContent?.trim() ?? ""
    );
    const name = pdfFileName(
      page.kind,
      /^oviya engineers\b/i.test(title) && firstNumber ? `${page.kind} ${firstNumber}` : title
    );
    const download = request.nextUrl.searchParams.get("download") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return message(500, "The PDF could not be made. Please try again.");
  } finally {
    await browser.close().catch(() => undefined);
  }
}

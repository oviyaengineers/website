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
    // Liberation Serif has no rupee sign, and the server has no other font
    // with one, so ₹ printed as a blank. The app's own Noto Sans Tamil (loaded
    // on every page) carries it; as the next font in line it supplies only
    // what Liberation Serif lacks, so the Latin text is unchanged.
    return `${rules.join("")}:root{font-family:"Times New Roman",var(--font-noto-tamil),"Noto Sans Tamil",serif;}`;
  })();
  fontCss.catch(() => {
    fontCss = null;
  });
  return fontCss;
}

/**
 * The packaged Chromium, unpacked into /tmp once per server instance.
 *
 * One instance serves several prints at once. Each call to executablePath()
 * unpacked the browser again unless the file already existed, so a second
 * print found the file half-written and could not start it ("spawn
 * ETXTBSY"). Every print now waits on the same single unpacking.
 */
let packagedChromium: Promise<{ executablePath: string; args: string[] }> | null = null;
function unpackChromium() {
  packagedChromium ??= (async () => {
    const chromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await chromium.executablePath(), args: chromium.args };
  })();
  packagedChromium.catch(() => {
    packagedChromium = null;
  });
  return packagedChromium;
}

/** The server browser: the packaged Chromium on Vercel, the installed Chrome elsewhere. */
async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { executablePath, args } = await unpackChromium();
    const launch = () => puppeteer.launch({ executablePath, args, headless: true });
    try {
      return await launch();
    } catch (error) {
      // An instance that was already unpacking when this code arrived: the
      // file is complete a moment later.
      if (!(error instanceof Error && error.message.includes("ETXTBSY"))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return launch();
    }
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

  // Which step failed goes into the error message and the server log. Nothing
  // secret is in any of them: no cookie, token or page content.
  let step = "starting the print browser";
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    step = "preparing the page";
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1240, height: 1754 });
    // An ordinary Chrome name: a "HeadlessChrome" visitor can be taken for a
    // bot and held at a challenge page that never finishes loading.
    const agent = (await browser.userAgent()).replace(/HeadlessChrome/g, "Chrome");
    await tab.setUserAgent({ userAgent: agent });
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

    step = "opening the print page";
    // Waiting for the network to go completely quiet is not dependable on a
    // live site; the document itself appearing is what matters.
    const response = await tab.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
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

    step = "waiting for the document";
    await tab.waitForSelector(".dc-print-page, .invoice-print-page, .dc-list-print", {
      timeout: 20_000,
    });
    // Images (logo, QR) and fonts; a quiet moment is enough, not total silence.
    await tab.waitForNetworkIdle({ idleTime: 400, timeout: 8_000 }).catch(() => undefined);
    await tab.evaluate(async () => {
      await document.fonts.ready;
      // Let the page's own fit check measure the final layout.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    step = "making the PDF";
    const pdf = await tab.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      // The whole point: no URL, date/time or page number from the browser.
      displayHeaderFooter: false,
    });
    // Named after the document: its page title, or for a challan (whose title
    // is just the company) the kind and the first number on the sheet.
    const title = await tab.title();
    // A document can name itself (data-print-name); a challan's first cell is its number.
    const firstNumber = await tab.evaluate(
      () =>
        document.querySelector<HTMLElement>("[data-print-name]")?.dataset.printName?.trim() ||
        document.querySelector(".dc-print-cell-value")?.textContent?.trim() ||
        ""
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
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "";
    console.error(`[print-pdf] failed while ${step} for ${page.kind}. ${detail}`);
    return message(
      500,
      `The PDF could not be made (${step}). Please try again.${detail ? ` <small style="color:#666">${detail.replace(/[<>&]/g, "")}</small>` : ""}`
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CombinedDcPrintSheet } from "@/components/combined-dc-print-sheet";
import { DcPrintFitCheck } from "@/components/dc-print-fit-check";
import { PrintPreview } from "@/components/print/print-preview";
import { DcPrintPageSetup } from "@/components/dc-print-page-setup";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import {
  checkCombinedSelection,
  combinedLayoutOptions,
  combinedQrMode,
  combinedRows,
  MAX_FULL_LINES,
  resolveCombinedLayout,
  type CombinedLayout,
  type CombinedSelectionProblem,
} from "@/lib/dc-combined-print";
import { dcQrCode } from "@/lib/dc-public-link";
import { getTranslator } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("dcCombined.title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROBLEM_KEYS: Record<CombinedSelectionProblem, TranslationKey> = {
  none: "dcCombined.invalidNone",
  missing: "dcCombined.invalidMissing",
  draft: "dcCombined.invalidDraft",
  customers: "dcCombined.invalidCustomers",
  dates: "dcCombined.invalidDates",
};

/**
 * Combined DC Print, step two: the selected DCs printed together.
 *
 * Read-only. The selection is checked again here, whatever the link says:
 * one customer, one Our DC Date, no drafts. Nothing is created — no DC, no DC
 * number, no combined QR code. Three lines or fewer print as ORIGINAL and
 * DUPLICATE on one A4 page; a longer print offers full A4 pages instead.
 */
export default async function CombinedDcPrintSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; layout?: string }>;
}) {
  const { ids, layout: requestedLayout } = await searchParams;
  const wanted = [
    ...new Set(
      (ids ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => UUID.test(part))
    ),
  ];

  const supabase = await createClient();
  const [{ data: found }, { lang, t }] = await Promise.all([
    wanted.length > 0
      ? supabase.from("delivery_challans").select("*").in("id", wanted).order("dc_number")
      : Promise.resolve({ data: [] as never[] }),
    getTranslator(),
  ]);
  const dcs = found ?? [];
  if (dcs.length === 0 && wanted.length > 0) notFound();

  const problem = checkCombinedSelection(wanted, dcs);
  // One DC is simply that DC's own print.
  if (!problem && dcs.length === 1) redirect(`/dashboard/dc/${dcs[0].id}/print`);

  const backHref = dcs[0]
    ? `/dashboard/dc/combined-print?date=${dcs[0].dc_date}&customer=${dcs[0].customer_id}`
    : "/dashboard/dc/combined-print";
  const back = (
    <Button render={<Link href={backHref} />} variant="outline">
      <ArrowLeft className="h-4 w-4" /> {t("dcCombined.back")}
    </Button>
  );
  const refuse = (message: string) => (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033]">
      <div className="sticky top-0 z-10 flex border-b bg-[#f4f6f9]/95 p-4">{back}</div>
      <p
        role="alert"
        className="mx-auto mt-10 max-w-lg rounded-lg border bg-white p-6 text-center text-sm"
      >
        {message}
      </p>
    </div>
  );

  if (problem) return refuse(t(PROBLEM_KEYS[problem]));

  const withQr = combinedQrMode(dcs.length) === "qr";
  const [{ data: items }, { data: customer }, { data: picklist }, qrs] = await Promise.all([
    supabase
      .from("delivery_challan_items")
      .select("*")
      .in(
        "dc_id",
        dcs.map((dc) => dc.id)
      ),
    supabase.from("customers").select("*").eq("id", dcs[0].customer_id).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
    // Each DC's own QR code, only when the sheet shows codes at all.
    withQr ? Promise.all(dcs.map((dc) => dcQrCode(supabase, dc.id))) : Promise.resolve([]),
  ]);
  const names = componentNameIndex(picklist ?? []);
  const rows = combinedRows(dcs, items ?? [], (line) => componentNameOf(line, names));

  const options = combinedLayoutOptions(rows.length);
  if (!options.fullFits) {
    return refuse(t("dcCombined.tooManyForPrint", { lines: rows.length, max: MAX_FULL_LINES }));
  }
  const layout = resolveCombinedLayout(requestedLayout, rows.length);
  const hrefFor = (value: CombinedLayout) =>
    `/dashboard/dc/combined-print/print?ids=${dcs.map((dc) => dc.id).join(",")}&layout=${value}`;

  return (
    <PrintPreview
      back={{ href: backHref, label: t("dcCombined.back") }}
      actions={
        <DcPrintFitCheck
          // Remounted per layout, so the new sheet is measured afresh.
          key={layout}
          backHref={backHref}
          fullPages={layout === "full"}
          alternative={
            layout === "half" && options.choose
              ? { href: hrefFor("full"), label: t("dcCombined.useFullPages") }
              : undefined
          }
        />
      }
      notes={
        <>
          <DcPrintPageSetup />

          {options.choose && (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">
                  {t("dcCombined.sourceLines", { count: rows.length })}
                </span>
                {" · "}
                {t("dcCombined.chooseLayout")}
              </p>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                <LayoutOption
                  selected={layout === "half"}
                  href={options.halfFits ? hrefFor("half") : null}
                  title={t("dcCombined.layoutHalf")}
                  hint={
                    options.halfFits
                      ? t("dcCombined.layoutHalfHint")
                      : t("dcCombined.layoutHalfTooLong")
                  }
                />
                <LayoutOption
                  selected={layout === "full"}
                  href={hrefFor("full")}
                  title={t("dcCombined.layoutFull")}
                  hint={t("dcCombined.layoutFullHint")}
                  badge={t("dcCombined.recommended")}
                />
              </div>
            </div>
          )}
        </>
      }
    >
      <div className="dc-print-stage">
        <CombinedDcPrintSheet
          layout={layout}
          dcs={dcs.map((dc, i) => ({
            id: dc.id,
            dcNumber: dc.dc_number,
            dcDate: dc.dc_date,
            authorizedBy: dc.authorized_by,
            qrSvg: withQr ? (qrs[i]?.svg ?? null) : null,
          }))}
          rows={rows}
          customer={customer}
          lang={lang}
          t={t}
        />
      </div>
      {/* Printed instead of the sheet if it overflows, so nothing is cut off silently. */}
      <div className="dc-print-overflow-note p-8 text-center">
        <p className="text-lg font-semibold">
          {layout === "full" ? t("dcCombined.overflowFullTitle") : t("dcCombined.overflowTitle")}
        </p>
        <p>{layout === "full" ? t("dcCombined.overflowFullBody") : t("dcCombined.overflowBody")}</p>
      </div>
    </PrintPreview>
  );
}

/** One choice of print layout. A disabled choice has no link. */
function LayoutOption({
  selected,
  href,
  title,
  hint,
  badge,
}: {
  selected: boolean;
  href: string | null;
  title: string;
  hint: string;
  badge?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-[#10233f]" : "border-slate-400"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-[#10233f]" />}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {title}
          {badge && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              {badge}
            </span>
          )}
        </span>
        <span className={`block text-xs ${href ? "text-muted-foreground" : "text-destructive"}`}>
          {hint}
        </span>
      </span>
    </>
  );
  const className = `flex items-start gap-2 rounded-md border bg-white p-3 text-sm ${
    selected ? "border-[#10233f] ring-1 ring-[#10233f]" : ""
  }`;
  return href ? (
    <Link
      href={href}
      role="radio"
      aria-checked={selected}
      className={`${className} hover:bg-slate-50`}
    >
      {body}
    </Link>
  ) : (
    <div role="radio" aria-checked={false} aria-disabled className={`${className} opacity-60`}>
      {body}
    </div>
  );
}

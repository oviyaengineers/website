"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { Translate, TranslationKey } from "@/lib/i18n/types";

/**
 * Segment labels that differ from a plain title-case of the URL segment.
 * Anything not listed falls back to title case, so new routes still read
 * sensibly without needing an entry here.
 */
const SEGMENT_LABELS: Record<string, TranslationKey> = {
  dashboard: "nav.dashboard",
  customers: "nav.customers",
  // Matches the menu, where these all sit under one DC group.
  dc: "nav.dc",
  scan: "nav.scanDc",
  scanned: "nav.scannedDcs",
  dispatched: "nav.dispatchedDcs",
  history: "nav.dcHistory",
  component: "common.component",
  stock: "nav.stockBalance",
  completed: "nav.completedDcs",
  weight: "nav.weightScrap",
  invoices: "nav.billing",
  costs: "nav.costs",
  reports: "nav.reports",
  outstanding: "nav.outstandingPayments",
  settings: "nav.settings",
  components: "nav.componentsMaterials",
  "dc-numbers": "nav.dcNumbers",
  unbilled: "nav.unbilledWork",
  billing: "nav.billingDetails",
  "invoice-numbers": "nav.invoiceNumbers",
  rates: "nav.rateList",
  balance: "nav.balance",
  edit: "common.edit",
  print: "nav.print",
  "print-list": "nav.printList",
  "combined-print": "dcCombined.menu",
};

/** The label for a "new" page, by the section it sits in. */
const NEW_LABELS: Record<string, TranslationKey> = {
  dc: "nav.newDcManual",
  invoices: "nav.newInvoice",
  customers: "nav.newCustomer",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelFor(segment: string, t: Translate): string {
  const key = SEGMENT_LABELS[segment];
  if (key) return t(key);
  // Fallback until the page reports the record's real name.
  if (UUID.test(segment)) return t("nav.details");
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** href is null for a folder with no page of its own, so the crumb is plain text. */
export type Crumb = { label: string; href: string | null; isRecord: boolean };

// Folders that only group pages beneath them. Linking them led to a 404, and
// the browser's prefetch of the link logged one on every page under them.
const NO_PAGE = [
  /^\/dashboard\/settings$/,
  /^\/dashboard\/reports$/,
  /^\/dashboard\/dc\/component$/,
  /^\/dashboard\/customers\/[^/]+$/,
];

export function buildCrumbs(pathname: string, t: Translate): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  let recordSeen = false;

  return segments.map((segment, i) => {
    // Only the first id in a path is the record this page is about.
    const isRecord = !recordSeen && UUID.test(segment);
    if (isRecord) recordSeen = true;

    const href = `/${segments.slice(0, i + 1).join("/")}`;
    // "new" means a different form in each section, so the parent decides it.
    const newKey = segment === "new" ? NEW_LABELS[segments[i - 1] ?? ""] : undefined;
    return {
      label: newKey ? t(newKey) : labelFor(segment, t),
      href: NO_PAGE.some((pattern) => pattern.test(href)) ? null : href,
      isRecord,
    };
  });
}

// --- Record label hand-off -------------------------------------------------
//
// The breadcrumb lives in the dashboard layout so every page gets one for
// free, but only the page itself knows what its record is called. A layout
// cannot read that from its children, so the page pushes the name into this
// small store and the breadcrumb subscribes to it. An external store (rather
// than context) keeps the breadcrumb re-rendering on navigation without the
// layout having to re-render at all.

let recordLabel: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribeRecordLabel(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Names the current record in the breadcrumb trail. Render it from a detail
 * page — it draws nothing itself.
 *
 * <BreadcrumbRecordLabel value={dc.dc_number} />
 */
export function BreadcrumbRecordLabel({ value }: { value: string | null | undefined }) {
  useEffect(() => {
    recordLabel = value?.trim() || null;
    emit();
    return () => {
      recordLabel = null;
      emit();
    };
  }, [value]);

  return null;
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const { t } = useI18n();
  const label = useSyncExternalStore(
    subscribeRecordLabel,
    () => recordLabel,
    // Nothing is registered during the server render.
    () => null
  );
  const crumbs = buildCrumbs(pathname, t);

  // A lone "Dashboard" crumb is just the page you are already on.
  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const text = crumb.isRecord && label ? label : crumb.label;
          return (
            <li key={`${i}-${crumb.label}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {text}
                </span>
              ) : crumb.href === null ? (
                <span>{text}</span>
              ) : (
                <Link href={crumb.href} className="rounded transition-colors hover:text-foreground">
                  {text}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

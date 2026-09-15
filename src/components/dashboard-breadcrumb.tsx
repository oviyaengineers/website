"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Segment labels that differ from a plain title-case of the URL segment.
 * Anything not listed falls back to title case, so new routes still read
 * sensibly without needing an entry here.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  // Matches the menu, where these all sit under one DC group.
  dc: "DC",
  new: "New DC - Manual",
  scan: "Scan DC",
  scanned: "Scanned DCs",
  dispatched: "Dispatched DCs",
  history: "DC History",
  component: "Component",
  stock: "Stock / Balance",
  completed: "Completed DCs",
  invoices: "Billing",
  costs: "Costs",
  reports: "Reports",
  outstanding: "Outstanding Payments",
  settings: "Settings",
  components: "Components & Materials",
  "dc-numbers": "DC Numbers",
  unbilled: "Unbilled Work",
  billing: "Billing Details",
  "invoice-numbers": "Invoice Numbers",
  rates: "Rate List",
  balance: "Balance",
  edit: "Edit",
  print: "Print",
};

/** The label for a "new" page, by the section it sits in. */
const NEW_LABELS: Record<string, string> = {
  dc: "New DC - Manual",
  invoices: "New Invoice",
  customers: "New Customer",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Fallback until the page reports the record's real name.
  if (UUID.test(segment)) return "Details";
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

export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  let recordSeen = false;

  return segments.map((segment, i) => {
    // Only the first id in a path is the record this page is about.
    const isRecord = !recordSeen && UUID.test(segment);
    if (isRecord) recordSeen = true;

    const href = `/${segments.slice(0, i + 1).join("/")}`;
    // "new" means a different form in each section, so the parent decides it.
    const newLabel = segment === "new" ? NEW_LABELS[segments[i - 1] ?? ""] : undefined;
    return {
      label: newLabel ?? labelFor(segment),
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
  const label = useSyncExternalStore(
    subscribeRecordLabel,
    () => recordLabel,
    // Nothing is registered during the server render.
    () => null
  );
  const crumbs = buildCrumbs(pathname);

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

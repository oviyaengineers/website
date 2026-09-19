"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarRange,
  FileText,
  IndianRupee,
  ListOrdered,
  CheckCircle2,
  FileClock,
  FilePlus2,
  Hash,
  LayoutDashboard,
  Inbox,
  Layers,
  ShieldCheck,
  Scale,
  ListChecks,
  LogOut,
  Receipt,
  ScanLine,
  Send,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import type { TranslationKey } from "@/lib/i18n/types";
import type { UserRole } from "@/types/database";

// Each entry gets its own icon colour so the nav is scannable at a glance —
// people learn the colour faster than they read the label.
type NavItem = {
  /** May carry a query, for an entry that is a filtered view of another page. */
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
  color: string;
  /** Longer paths that still belong to this entry, for the active marker. */
  alsoUnder?: string[];
  /** Match the path exactly, for an entry that is a parent of the others. */
  exact?: boolean;
  /** Which count, if any, is shown beside the entry. */
  badge?: "drafts";
};

type NavGroup = { labelKey: TranslationKey; items: NavItem[]; adminOnly?: boolean };

// The delivery challan work is one job done in five places, and as a flat list
// its parts sat among Customers and Invoices with nothing saying they belonged
// together. Grouping them means the operator picks the job first and the step
// within it second.
const NAV: NavGroup[] = [
  {
    labelKey: "nav.menu",
    items: [
      {
        href: "/dashboard",
        labelKey: "nav.dashboard",
        icon: LayoutDashboard,
        color: "text-amber-400",
        exact: true,
      },
    ],
  },
  {
    labelKey: "nav.dc",
    items: [
      {
        href: "/dashboard/dc/new",
        labelKey: "nav.newDcManual",
        icon: FilePlus2,
        color: "text-emerald-400",
      },
      {
        href: "/dashboard/dc/scan",
        labelKey: "nav.scanDc",
        icon: ScanLine,
        color: "text-teal-400",
      },
      {
        href: "/dashboard/dc/scanned",
        labelKey: "nav.scannedDcs",
        icon: Inbox,
        color: "text-amber-300",
      },
      // Sits at /dashboard/dc, a prefix of the two entries above it, so the
      // active marker has to prefer the longest match rather than the first.
      { href: "/dashboard/dc", labelKey: "nav.allDcs", icon: ListChecks, color: "text-sky-400" },
      // All DCs filtered to challans not yet confirmed. Not a page of its own:
      // a draft is an ordinary challan in an early state, and the list already
      // shows everything about it.
      {
        href: "/dashboard/dc?status=draft",
        labelKey: "nav.draftDcs",
        icon: FileClock,
        color: "text-slate-300",
        badge: "drafts",
      },
      {
        href: "/dashboard/dc/dispatched",
        labelKey: "nav.dispatchedDcs",
        icon: Send,
        color: "text-indigo-300",
      },
      // Print only: several issued DCs of one customer and one date on one sheet.
      {
        href: "/dashboard/dc/combined-print",
        labelKey: "dcCombined.menu",
        icon: Layers,
        color: "text-cyan-300",
      },
      {
        href: "/dashboard/stock",
        labelKey: "nav.stockBalance",
        icon: Boxes,
        color: "text-fuchsia-400",
        alsoUnder: ["/dashboard/balance"],
      },
      {
        href: "/dashboard/completed",
        labelKey: "nav.completedDcs",
        icon: CheckCircle2,
        color: "text-lime-400",
      },
      {
        href: "/dashboard/weight",
        labelKey: "nav.weightScrap",
        icon: Scale,
        color: "text-teal-300",
      },
      {
        href: "/dashboard/dc/history",
        labelKey: "nav.dcHistory",
        icon: CalendarRange,
        color: "text-orange-300",
      },
    ],
  },
  {
    labelKey: "nav.records",
    items: [
      {
        href: "/dashboard/customers",
        labelKey: "nav.customers",
        icon: Users,
        color: "text-cyan-400",
      },
      {
        href: "/dashboard/invoices",
        labelKey: "nav.billing",
        icon: Receipt,
        color: "text-violet-400",
      },
      {
        // A report: behind the Billing PIN, like everything under /dashboard/reports.
        href: "/dashboard/reports/customer-statement",
        labelKey: "nav.customerStatement",
        icon: FileText,
        color: "text-emerald-400",
      },
    ],
  },
  {
    labelKey: "nav.admin",
    adminOnly: true,
    items: [
      { href: "/dashboard/costs", labelKey: "nav.costs", icon: Wallet, color: "text-rose-400" },
      {
        href: "/dashboard/reports/outstanding",
        labelKey: "nav.reports",
        icon: BarChart3,
        color: "text-orange-400",
      },
      {
        href: "/dashboard/settings/dc-numbers",
        labelKey: "nav.dcNumbers",
        icon: Hash,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/components",
        labelKey: "nav.componentsMaterials",
        icon: Settings,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/billing",
        labelKey: "nav.billingDetails",
        icon: FileText,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/invoice-numbers",
        labelKey: "nav.invoiceNumbers",
        icon: ListOrdered,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/rates",
        labelKey: "nav.rateList",
        icon: IndianRupee,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/weight-master",
        labelKey: "nav.weightMaster",
        icon: Scale,
        color: "text-slate-300",
      },
    ],
  },
];

/**
 * Which nav entry owns the current page.
 *
 * Resolved across every entry at once and won by the longest match, because
 * "All DCs" is a prefix of both entry points listed above it and would
 * otherwise light up whenever either of them was open. An entry whose href
 * carries a query matches only while every value in it is present, so Draft
 * DCs lights up on the drafts view and All DCs on the unfiltered list, though
 * both are the same page.
 */
function activeHref(pathname: string, search: URLSearchParams, items: NavItem[]): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const [path, query] = item.href.split("?");
    const wanted = new URLSearchParams(query ?? "");
    if ([...wanted].some(([key, value]) => search.get(key) !== value)) continue;

    const paths = [path, ...(item.alsoUnder ?? [])];
    const hit = item.exact
      ? paths.includes(pathname)
      : paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!hit) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best?.href ?? null;
}

export function AppSidebar({
  fullName,
  email,
  role,
  draftCount,
}: {
  fullName: string | null;
  email: string | null;
  role: UserRole;
  /** Challans still in draft, shown beside Draft DCs. */
  draftCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = NAV.filter((group) => !group.adminOnly || role === "admin");
  const active = activeHref(
    pathname,
    new URLSearchParams(searchParams.toString()),
    groups.flatMap((group) => group.items)
  );

  // On a phone the nav is a sheet over the page, and it stayed open after a
  // tap — the page had navigated, but the sidebar was still covering it, so
  // nothing looked like it had happened. Closing it hands the page straight
  // over. On desktop the sidebar is permanent and nothing needs to close.
  function closeOnMobile() {
    if (isMobile) setOpenMobile(false);
  }
  const displayName = fullName || email || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-[#10233f] shadow-sm shadow-amber-500/30">
            OE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">Oviya Engineers</span>
            <span className="text-xs text-slate-400">{t("nav.internalSystem")}</span>
          </div>
        </div>
      </SidebarHeader>
      {/* The menu is longer than a laptop screen for an admin, and the kit
          hides the scroll bar, so there was no sign more entries sat below.
          sidebar-scroll brings back a slim bar (globals.css). */}
      <SidebarContent className="sidebar-scroll">
        {groups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = active === item.href;
                  const count = item.badge === "drafts" ? draftCount : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} onClick={closeOnMobile} />}
                        isActive={isActive}
                        className={cn(
                          // Roomy enough to tap in the mobile sheet; the compact
                          // desktop height is kept from md up.
                          "relative h-11 md:h-8",
                          // Hover and active share a background in the base
                          // styles, so the active row gets an amber marker of
                          // its own to stay distinguishable.
                          isActive &&
                            "font-semibold text-white before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full before:bg-amber-400"
                        )}
                      >
                        <item.icon className={isActive ? "text-amber-400" : item.color} />
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuButton>
                      {/* Shown only when something is waiting, so an empty
                          badge never reads as a figure to act on. The kit
                          places a badge with a rule keyed to the button's
                          size, which outranked plain centring: on the 44px
                          mobile row it sat 16px high, on the line with All
                          DCs, and read as that entry's count. Set with the
                          same rule instead: 12px down the mobile row, 6px
                          down the 32px desktop one, centred on both. */}
                      {count > 0 && (
                        <SidebarMenuBadge
                          className="bg-amber-400/20 text-amber-300 peer-data-[size=default]/menu-button:top-3 md:peer-data-[size=default]/menu-button:top-1.5"
                          aria-label={
                            count === 1 ? t("nav.draftCountOne") : t("nav.draftCount", { count })
                          }
                        >
                          {count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-white/10 text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-white">{displayName}</span>
            <span className="text-xs text-amber-400/90">
              {role === "admin" ? t("nav.roleAdmin") : t("nav.roleStaff")}
            </span>
          </div>
        </div>
        {/* Each person's own Billing & Weight PIN, so it sits with the account
            rather than in the admin-only settings. */}
        <SidebarMenuButton
          render={<Link href="/dashboard/settings/security" onClick={closeOnMobile} />}
          isActive={pathname === "/dashboard/settings/security"}
          className="h-11 w-full text-slate-300 hover:text-white md:h-8"
        >
          <ShieldCheck className="text-emerald-400" />
          <span>{t("security.menu")}</span>
        </SidebarMenuButton>
        <form action={logoutAction}>
          <SidebarMenuButton
            type="submit"
            className="h-11 w-full text-slate-300 hover:text-white md:h-8"
          >
            <LogOut className="text-rose-400" />
            <span>{t("nav.logOut")}</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

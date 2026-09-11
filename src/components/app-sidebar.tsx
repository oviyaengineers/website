"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  FilePlus2,
  Hash,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Receipt,
  ScanLine,
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
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import type { UserRole } from "@/types/database";

// Each entry gets its own icon colour so the nav is scannable at a glance —
// people learn the colour faster than they read the label.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color: string;
  /** Longer paths that still belong to this entry, for the active marker. */
  alsoUnder?: string[];
  /** Match the path exactly, for an entry that is a parent of the others. */
  exact?: boolean;
};

type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean };

// The delivery challan work is one job done in five places, and as a flat list
// its parts sat among Customers and Invoices with nothing saying they belonged
// together. Grouping them means the operator picks the job first and the step
// within it second.
const NAV: NavGroup[] = [
  {
    label: "Menu",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        color: "text-amber-400",
        exact: true,
      },
    ],
  },
  {
    label: "DC",
    items: [
      {
        href: "/dashboard/dc/new",
        label: "New DC - Manual",
        icon: FilePlus2,
        color: "text-emerald-400",
      },
      { href: "/dashboard/dc/scan", label: "Scan DC", icon: ScanLine, color: "text-teal-400" },
      // Sits at /dashboard/dc, a prefix of the two entries above it, so the
      // active marker has to prefer the longest match rather than the first.
      { href: "/dashboard/dc", label: "All DCs", icon: ListChecks, color: "text-sky-400" },
      {
        href: "/dashboard/stock",
        label: "Stock / Balance",
        icon: Boxes,
        color: "text-fuchsia-400",
        alsoUnder: ["/dashboard/balance"],
      },
      {
        href: "/dashboard/completed",
        label: "Completed DCs",
        icon: CheckCircle2,
        color: "text-lime-400",
      },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users, color: "text-cyan-400" },
      { href: "/dashboard/invoices", label: "Billing", icon: Receipt, color: "text-violet-400" },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { href: "/dashboard/costs", label: "Costs", icon: Wallet, color: "text-rose-400" },
      {
        href: "/dashboard/reports/outstanding",
        label: "Reports",
        icon: BarChart3,
        color: "text-orange-400",
      },
      {
        href: "/dashboard/settings/dc-numbers",
        label: "DC Numbers",
        icon: Hash,
        color: "text-slate-300",
      },
      {
        href: "/dashboard/settings/components",
        label: "Components & Materials",
        icon: Settings,
        color: "text-slate-300",
      },
    ],
  },
];

/**
 * Which nav entry owns the current path.
 *
 * Resolved across every entry at once and won by the longest match, because
 * "All DCs" is a prefix of both entry points listed above it and would
 * otherwise light up whenever either of them was open.
 */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const paths = [item.href, ...(item.alsoUnder ?? [])];
    const hit = item.exact
      ? paths.includes(pathname)
      : paths.some((path) => pathname === path || pathname.startsWith(path + "/"));
    if (!hit) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best?.href ?? null;
}

export function AppSidebar({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string | null;
  role: UserRole;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = NAV.filter((group) => !group.adminOnly || role === "admin");
  const active = activeHref(
    pathname,
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
            <span className="text-xs text-slate-400">Internal System</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = active === item.href;
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
                        <span>{item.label}</span>
                      </SidebarMenuButton>
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
            <span className="text-xs capitalize text-amber-400/90">{role}</span>
          </div>
        </div>
        <form action={logoutAction}>
          <SidebarMenuButton
            type="submit"
            className="h-11 w-full text-slate-300 hover:text-white md:h-8"
          >
            <LogOut className="text-rose-400" />
            <span>Log out</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Truck,
  Receipt,
  Wallet,
  BarChart3,
  LogOut,
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
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/lib/actions/auth";
import type { UserRole } from "@/types/database";

const baseNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/dc", label: "Delivery Challans", icon: Truck },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
];

const adminNav = [
  { href: "/dashboard/costs", label: "Costs", icon: Wallet },
  { href: "/dashboard/reports/outstanding", label: "Reports", icon: BarChart3 },
];

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
  const items = role === "admin" ? [...baseNav, ...adminNav] : baseNav;
  const displayName = fullName || email || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
            OE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Oviya Engineers</span>
            <span className="text-xs text-muted-foreground">Internal System</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="text-xs capitalize text-muted-foreground">{role}</span>
          </div>
        </div>
        <form action={logoutAction}>
          <SidebarMenuButton type="submit" className="w-full">
            <LogOut />
            <span>Log out</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

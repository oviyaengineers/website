import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardScanButton } from "@/components/dashboard-scan-button";
import { DashboardBreadcrumb } from "@/components/dashboard-breadcrumb";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/auth/login");
  }

  const role = profile?.role ?? "staff";

  // The header scanner needs the same picklists the DC form matches against.
  const supabase = await createClient();
  const [{ data: customers }, { data: picklistItems }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("dc_picklist_items").select("*").order("name"),
  ]);
  const components = (picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name);
  const materials = (picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name);

  return (
    <SidebarProvider>
      <AppSidebar fullName={profile?.full_name ?? null} email={user.email} role={role} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 size-11 md:size-8" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {/* The label yields space before the scan button does: min-w-0 plus
              truncate lets it shrink on a narrow phone, and shrink-0 keeps the
              button at full size instead of being squeezed out of the bar. */}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            Oviya Engineers Dashboard
          </span>
          {/* In the shell rather than on the DC form, so a challan can be
              scanned from any page at any point. */}
          <div className="shrink-0">
            <DashboardScanButton
              customers={customers ?? []}
              components={components}
              materials={materials}
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <DashboardBreadcrumb />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

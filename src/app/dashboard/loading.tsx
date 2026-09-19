import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Shown the moment a dashboard link is followed, while the next page is made
 * on the server. The sidebar and header stay; only the page area waits, so a
 * click is answered at once instead of the old page sitting unchanged. It
 * also lets Next.js prefetch each page up to this point, which makes the
 * switch itself immediate. Display only.
 */
export default async function DashboardLoading() {
  const { t } = await getTranslator();
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

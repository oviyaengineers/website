"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import type { WeightStatus } from "@/lib/weight";

const styles: Record<WeightStatus, string> = {
  notWeighed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  rateMissing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  weighed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  sentChanged: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function WeightStatusBadge({ status }: { status: WeightStatus }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={`whitespace-normal border-transparent text-left ${styles[status]}`}
    >
      {t(`weight.status.${status}`)}
    </Badge>
  );
}

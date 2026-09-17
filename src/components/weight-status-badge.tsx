import { Badge } from "@/components/ui/badge";
import { WEIGHT_STATUS_TEXT, type WeightStatus } from "@/lib/weight";

const styles: Record<WeightStatus, string> = {
  notConfigured: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  recorded: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  sentChanged: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function WeightStatusBadge({ status }: { status: WeightStatus }) {
  return (
    <Badge
      variant="outline"
      className={`whitespace-normal border-transparent text-left ${styles[status]}`}
    >
      {WEIGHT_STATUS_TEXT[status]}
    </Badge>
  );
}

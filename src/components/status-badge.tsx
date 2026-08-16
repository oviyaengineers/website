import { Badge } from "@/components/ui/badge";
import type { DcStatus, PaymentStatus } from "@/types/database";

const dcStyles: Record<DcStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  dispatched: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export function DcStatusBadge({ status }: { status: DcStatus }) {
  return (
    <Badge variant="outline" className={`capitalize border-transparent ${dcStyles[status]}`}>
      {status}
    </Badge>
  );
}

const paymentStyles: Record<PaymentStatus, string> = {
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={`capitalize border-transparent ${paymentStyles[status]}`}>
      {status}
    </Badge>
  );
}

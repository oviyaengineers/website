"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { MONTH_STATUS_LABELS, type BillingStatus, type MonthBillingStatus } from "@/lib/billing";
import type { InvoiceStatus } from "@/types/database";

const BILLING_STYLES: Record<BillingStatus, string> = {
  "not-billable": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  unbilled: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  partial: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  billed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const BILLING_STATUS_KEYS: Record<BillingStatus, TranslationKey> = {
  "not-billable": "billingStatus.notBillable",
  unbilled: "billingStatus.unbilled",
  partial: "billingStatus.partial",
  billed: "billingStatus.billed",
};

export function BillingStatusBadge({ status }: { status: BillingStatus }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${BILLING_STYLES[status]}`}
    >
      {t(BILLING_STATUS_KEYS[status])}
    </Badge>
  );
}

const MONTH_STYLES: Record<MonthBillingStatus, string> = {
  "no-work": BILLING_STYLES["not-billable"],
  unbilled: BILLING_STYLES.unbilled,
  partial: BILLING_STYLES.partial,
  billed: BILLING_STYLES.billed,
};

/** A customer-month: no billable work, unbilled, partially billed or fully billed. */
export function MonthStatusBadge({ status }: { status: MonthBillingStatus }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${MONTH_STYLES[status]}`}
    >
      {MONTH_STATUS_LABELS[status]}
    </Badge>
  );
}

/** GST tax invoice or normal bill (no GST). Fixed once issued. */
export function BillTypeBadge({ gstBill }: { gstBill: boolean }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${
        gstBill
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {gstBill ? "GST invoice" : "Normal bill"}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${
        status === "cancelled"
          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      }`}
    >
      {status === "cancelled" ? "Cancelled" : "Issued"}
    </Badge>
  );
}

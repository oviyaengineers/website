import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InvoiceBuilder, type BuilderMonth } from "@/components/invoice-builder";
import {
  fetchBillableLines,
  fetchCompanySettings,
  missingCompanyDetails,
} from "@/lib/billing-data";
import { monthStart, parseMonthInput } from "@/lib/billing";
import { indiaToday } from "@/lib/india-date";

export const metadata: Metadata = { title: "New Invoice | Oviya Engineers" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; month?: string; dc?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, settings, { data: nextNumber }] = await Promise.all([
    supabase.from("customers").select("id, name, state, gst_number").order("name"),
    fetchCompanySettings(supabase),
    supabase.rpc("peek_invoice_number"),
  ]);

  const list = customers ?? [];
  // As on the challan form: with one customer on file, start on that customer.
  const customerId =
    params.customer && UUID.test(params.customer)
      ? params.customer
      : list.length === 1
        ? list[0].id
        : null;
  const open = customerId
    ? (await fetchBillableLines({ customerId })).filter((line) => line.unbilled > 0)
    : [];

  const today = indiaToday();
  const preselectDcId = params.dc && UUID.test(params.dc) ? params.dc : null;

  // Months with unbilled work for this customer, oldest first.
  const byMonth = new Map<string, BuilderMonth>();
  for (const line of open) {
    const entry = byMonth.get(line.billingMonth) ?? {
      month: line.billingMonth,
      unbilled: 0,
      lines: 0,
    };
    entry.unbilled += line.unbilled;
    entry.lines += 1;
    byMonth.set(line.billingMonth, entry);
  }
  const withWork = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

  // The month asked for; else the month of the DC being billed; else the
  // oldest month still waiting; else the current month.
  const billingMonth =
    parseMonthInput(params.month) ??
    open.find((line) => line.dcId === preselectDcId)?.billingMonth ??
    withWork[0]?.month ??
    monthStart(today);

  for (const month of [billingMonth, monthStart(today)]) {
    if (!byMonth.has(month)) byMonth.set(month, { month, unbilled: 0, lines: 0 });
  }
  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  const lines = open.filter((line) => line.billingMonth === billingMonth);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Invoice</h1>
        <p className="text-sm text-muted-foreground">
          Bill Sent quantity from one month&apos;s issued delivery challans. Only what is still
          unbilled can be selected.
        </p>
      </div>
      {/* Keyed on customer and month, so switching either starts a fresh selection. */}
      <InvoiceBuilder
        key={`${customerId ?? "none"}|${billingMonth}`}
        customers={list}
        customerId={customerId}
        billingMonth={billingMonth}
        months={months}
        lines={lines}
        today={today}
        companyState={settings?.state ?? null}
        defaultGstRate={
          settings?.default_gst_rate === null || settings?.default_gst_rate === undefined
            ? null
            : Number(settings.default_gst_rate)
        }
        defaultHsn={settings?.default_hsn_sac ?? null}
        missingCompany={missingCompanyDetails(settings)}
        nextInvoiceNumber={typeof nextNumber === "string" ? nextNumber : null}
        preselectDcId={preselectDcId}
      />
    </div>
  );
}

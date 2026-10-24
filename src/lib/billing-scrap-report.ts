import { createClient } from "@/lib/supabase/server";
import { fetchDcRows } from "@/lib/dc-rows";
import { parseMonthInput } from "@/lib/billing";
import { fetchWeightLines } from "@/lib/weight-data";
import { statementDate } from "@/lib/customer-statement";
import type { WeightScrapArchiveRow } from "@/types/database";

export type ReportPeriod = {
  range: "month" | "dates";
  month: string;
  from: string;
  to: string;
};

export type BillingScrapDcLine = {
  id: string;
  component: string;
  material: string | null;
  sentQty: number;
  rate: number | null;
  value: number | null;
};

export type BillingScrapDc = {
  id: string;
  number: string;
  date: string;
  customer: string;
  complete: boolean;
  lines: BillingScrapDcLine[];
  sentQty: number;
  value: number;
  unratedLines: number;
};

export type BillingScrapInvoice = {
  id: string;
  number: string;
  date: string;
  customer: string;
  gstBill: boolean;
  total: number;
};

export type BillingScrapLine = {
  id: string;
  date: string;
  dcNumber: string;
  customer: string;
  component: string;
  material: string | null;
  sentQty: number;
  totalScrapMg: number | null;
  ratePaisePerKg: number | null;
  valuePaise: number | null;
  state: "Recorded" | "Sent Qty changed" | "Archived" | "Not recorded";
};

export type BillingScrapMaterialTotal = {
  totalScrapMg: number;
  valuePaise: number | null;
};

export type BillingScrapReport = {
  dcs: BillingScrapDc[];
  completedDcs: number;
  totalDcValue: number;
  unratedDcLines: number;
  invoices: BillingScrapInvoice[];
  invoiceTotal: number;
  scrapLines: BillingScrapLine[];
  recordedScrapMg: number;
  scrapValuePaise: number | null;
  scrapByMaterial: {
    ms: BillingScrapMaterialTotal;
    cf8m: BillingScrapMaterialTotal;
  };
  unpricedScrapLines: number;
};

/** Read-only date/month selection. The chosen bounds are inclusive. */
export function resolveReportPeriod(
  search: { range?: string; month?: string; from?: string; to?: string },
  today: string
): { period: ReportPeriod | null; error: string | null } {
  if (search.range === "dates") {
    const from = statementDate(search.from);
    const to = statementDate(search.to);
    if (!from || !to) return { period: null, error: "Choose a valid From and To date." };
    if (from > to) return { period: null, error: "From date must be on or before To date." };
    return { period: { range: "dates", month: from.slice(0, 7), from, to }, error: null };
  }

  const month = parseMonthInput(search.month) ?? `${today.slice(0, 7)}-01`;
  const start = new Date(`${month}T00:00:00Z`);
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const to = nextMonth.toISOString().slice(0, 10);
  return {
    period: { range: "month", month: month.slice(0, 7), from: month, to },
    error: null,
  };
}

/** Billing, DC completion and recorded/archived scrap, calculated without writes. */
export async function fetchBillingScrapReport(
  from: string,
  to: string
): Promise<BillingScrapReport> {
  const supabase = await createClient();
  const [allDcRows, weightLines, invoicesResult, customersResult, archiveResult] =
    await Promise.all([
      fetchDcRows(),
      fetchWeightLines(),
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, customer_id, grand_total, gst_bill")
        .eq("status", "issued")
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false }),
      supabase.from("customers").select("id, name"),
      supabase
        .from("weight_scrap_archive")
        .select("*")
        .gte("dc_date", from)
        .lte("dc_date", to)
        .order("dc_date", { ascending: false }),
    ]);

  for (const [name, error] of [
    ["invoices", invoicesResult.error],
    ["customers", customersResult.error],
    ["scrap archive", archiveResult.error],
  ] as const) {
    if (error) throw new Error(`Billing & Scrap Report: ${name}: ${error.message}`);
  }

  const dcRows = allDcRows.filter((row) => row.dcDate >= from && row.dcDate <= to);
  const itemIds = dcRows.map((row) => row.id);
  const [{ data: itemLinks, error: itemLinksError }, { data: rateRows, error: rateError }] =
    await Promise.all([
      itemIds.length
        ? supabase.from("delivery_challan_items").select("id, component_id").in("id", itemIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("component_rates").select("component_id, material, rate"),
    ]);
  if (itemLinksError) throw new Error(`Billing & Scrap Report: DC items: ${itemLinksError.message}`);
  if (rateError) throw new Error(`Billing & Scrap Report: rates: ${rateError.message}`);

  const componentByItem = new Map(
    (itemLinks ?? []).map((item) => [item.id, item.component_id as string | null])
  );
  const rateByComponentMaterial = new Map(
    (rateRows ?? []).map((row) => [`${row.component_id}|${row.material}`, Number(row.rate)])
  );
  const rowsByDc = new Map<string, typeof dcRows>();
  for (const row of dcRows) {
    const group = rowsByDc.get(row.dcId) ?? [];
    group.push(row);
    rowsByDc.set(row.dcId, group);
  }

  const dcs = [...rowsByDc.entries()].map(([id, rows]): BillingScrapDc => {
    const lines = rows.map((row): BillingScrapDcLine => {
      const componentId = componentByItem.get(row.id);
      const rateValue = componentId
        ? rateByComponentMaterial.get(`${componentId}|${row.material ?? ""}`)
        : undefined;
      const rate = rateValue !== undefined && Number.isFinite(rateValue) ? rateValue : null;
      return {
        id: row.id,
        component: row.component,
        material: row.material,
        sentQty: row.sent,
        rate,
        value: rate === null ? null : Math.round((row.sent * rate + Number.EPSILON) * 100) / 100,
      };
    });
    const valueLines = lines.filter((line) => line.value !== null);
    return {
      id,
      number: rows[0].dcNumber,
      date: rows[0].dcDate,
      customer: rows[0].customerName,
      complete: rows.every((row) => row.pending === 0) && rows.some((row) => row.outward > 0),
      lines,
      sentQty: lines.reduce((sum, line) => sum + line.sentQty, 0),
      value: valueLines.reduce((sum, line) => sum + (line.value ?? 0), 0),
      unratedLines: lines.filter((line) => line.rate === null && line.sentQty > 0).length,
    };
  });
  dcs.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  const customerById = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer.name]));
  const invoices = (invoicesResult.data ?? []).map((invoice): BillingScrapInvoice => ({
    id: invoice.id,
    number: invoice.invoice_number,
    date: invoice.invoice_date,
    customer: customerById.get(invoice.customer_id) ?? "-",
    gstBill: invoice.gst_bill,
    total: Number(invoice.grand_total),
  }));

  const activeScrap: BillingScrapLine[] = weightLines
    .filter((line) => line.dcDate >= from && line.dcDate <= to)
    .map((line) => ({
      id: `live:${line.itemId}`,
      date: line.dcDate,
      dcNumber: line.dcNumber,
      customer: line.customerName,
      component: line.component,
      material: line.material,
      sentQty: line.recorded?.sentQty ?? line.sentQty,
      totalScrapMg: line.recorded?.totalScrapMg ?? null,
      ratePaisePerKg: line.recorded?.ratePaisePerKg ?? null,
      valuePaise: line.recorded?.valuePaise ?? null,
      state: line.recorded
        ? line.status === "sentChanged"
          ? "Sent Qty changed"
          : "Recorded"
        : "Not recorded",
    }));
  const archivedScrap: BillingScrapLine[] = ((archiveResult.data ?? []) as WeightScrapArchiveRow[]).map(
    (row) => ({
      id: `archive:${row.id}`,
      date: row.dc_date,
      dcNumber: row.dc_number,
      customer: row.customer_name,
      component: row.component,
      material: row.material,
      sentQty: Number(row.sent_qty_at_save),
      totalScrapMg: Math.round(Number(row.total_scrap_g) * 1000),
      ratePaisePerKg:
        row.scrap_rate_per_kg === null ? null : Math.round(Number(row.scrap_rate_per_kg) * 100),
      valuePaise: row.scrap_value === null ? null : Math.round(Number(row.scrap_value) * 100),
      state: "Archived",
    })
  );
  const scrapLines = [...activeScrap, ...archivedScrap].sort(
    (a, b) => b.date.localeCompare(a.date) || b.dcNumber.localeCompare(a.dcNumber)
  );
  const recordedScrap = scrapLines.filter((line) => line.totalScrapMg !== null);
  const pricedScrap = recordedScrap.filter((line) => line.valuePaise !== null);
  const sumScrapGroup = (matches: (material: string) => boolean): BillingScrapMaterialTotal => {
    const lines = recordedScrap.filter((line) => line.material !== null && matches(line.material.trim().toLowerCase()));
    const pricedLines = lines.filter((line) => line.valuePaise !== null);
    return {
      totalScrapMg: lines.reduce((sum, line) => sum + (line.totalScrapMg ?? 0), 0),
      valuePaise:
        pricedLines.length === 0
          ? null
          : pricedLines.reduce((sum, line) => sum + (line.valuePaise ?? 0), 0),
    };
  };

  return {
    dcs,
    completedDcs: dcs.filter((dc) => dc.complete).length,
    totalDcValue: dcs.reduce((sum, dc) => sum + dc.value, 0),
    unratedDcLines: dcs.reduce((sum, dc) => sum + dc.unratedLines, 0),
    invoices,
    invoiceTotal: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    scrapLines,
    recordedScrapMg: recordedScrap.reduce((sum, line) => sum + (line.totalScrapMg ?? 0), 0),
    scrapValuePaise:
      pricedScrap.length === 0
        ? null
        : pricedScrap.reduce((sum, line) => sum + (line.valuePaise ?? 0), 0),
    scrapByMaterial: {
      ms: sumScrapGroup((material) => material === "ms" || material === "a105" || material === "wcb"),
      cf8m: sumScrapGroup((material) => material === "cf8m"),
    },
    unpricedScrapLines: recordedScrap.filter((line) => line.valuePaise === null).length,
  };
}


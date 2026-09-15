import { createClient } from "@/lib/supabase/server";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import {
  billingStatus,
  monthBillingStatus,
  type BillingStatus,
  type MonthBillingStatus,
} from "@/lib/billing";
import { matchesTerm } from "@/lib/dc-search";
import type {
  CompanyBillingSettingsRow,
  ComponentRateRow,
  InvoiceItemRow,
  InvoiceNumberSeriesRow,
  InvoiceRow,
} from "@/types/database";

/**
 * Reads for the billing screens. Nothing here writes.
 *
 * Quantities come from the dc_line_billing view (migration 0026): billable is
 * a DC line's Sent once the challan is issued, billed is the sum of its
 * allocations on issued invoices, and the billing month is the calendar month
 * of the DC date. No billed figure is stored anywhere to fall out of step.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function fetchCompanySettings(
  supabase?: Supabase
): Promise<CompanyBillingSettingsRow | null> {
  const db = supabase ?? (await createClient());
  const { data } = await db.from("company_billing_settings").select("*").maybeSingle();
  return data ?? null;
}

/** Both number series: GST tax invoices (gst) and normal bills (non_gst). */
export async function fetchInvoiceSeries(supabase?: Supabase): Promise<InvoiceNumberSeriesRow[]> {
  const db = supabase ?? (await createClient());
  const { data } = await db.from("invoice_number_series").select("*").order("kind");
  return data ?? [];
}

/**
 * What the company must have entered before issuing: the legal name for any
 * bill, and GSTIN and state as well for a GST tax invoice.
 */
export function missingCompanyDetails(
  settings: CompanyBillingSettingsRow | null,
  gstBill = true
): string[] {
  if (!settings) return ["billing settings"];
  const missing: string[] = [];
  if (!settings.legal_name?.trim()) missing.push("company legal name");
  if (gstBill && !settings.gstin?.trim()) missing.push("company GSTIN");
  if (gstBill && !settings.state?.trim()) missing.push("company state");
  return missing;
}

export type BillableLine = {
  dcItemId: string;
  dcId: string;
  dcNumber: string;
  dcDate: string;
  billingMonth: string;
  customerId: string;
  customerName: string;
  customerDcNumbers: string[];
  component: string;
  componentId: string | null;
  material: string | null;
  /** Billable quantity: the line's Sent, once its DC is issued. */
  sent: number;
  billed: number;
  unbilled: number;
  status: BillingStatus;
  /** Rate List entry for the component and material, when one exists. */
  listRate: number | null;
  listHsn: string | null;
  /** Set on a follow-up line: the original DC it despatches against. */
  followUpOf: string | null;
};

export type BillableFilters = {
  customerId?: string;
  billingMonth?: string;
  q?: string;
  from?: string;
  to?: string;
  component?: string;
  material?: string;
  status?: string;
};

/** DC lines with Sent quantity, and how much of each is billed. Newest DC first. */
export async function fetchBillableLines(filters: BillableFilters = {}): Promise<BillableLine[]> {
  const supabase = await createClient();

  let billingQuery = supabase.from("dc_line_billing").select("*").gt("billable_qty", 0);
  if (filters.customerId) billingQuery = billingQuery.eq("customer_id", filters.customerId);
  if (filters.billingMonth) billingQuery = billingQuery.eq("billing_month", filters.billingMonth);

  const [{ data: billing }, { data: customers }, { data: picklist }, { data: rates }] =
    await Promise.all([
      billingQuery,
      supabase.from("customers").select("id, name"),
      supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
      supabase.from("component_rates").select("*"),
    ]);
  const rows = billing ?? [];
  if (rows.length === 0) return [];

  const itemIds = rows.map((row) => row.dc_item_id);
  const dcIds = [...new Set(rows.map((row) => row.dc_id))];
  const [{ data: items }, { data: challans }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").in("id", itemIds),
    supabase
      .from("delivery_challans")
      .select("id, dc_number, dc_date, customer_dc_number, parent_dc_id")
      .in("id", dcIds),
  ]);

  const parentIds = [...new Set((challans ?? []).map((dc) => dc.parent_dc_id).filter(Boolean))];
  const { data: parents } = parentIds.length
    ? await supabase
        .from("delivery_challans")
        .select("id, dc_number")
        .in("id", parentIds as string[])
    : { data: [] as { id: string; dc_number: string }[] };

  const names = componentNameIndex(picklist ?? []);
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const dcById = new Map((challans ?? []).map((dc) => [dc.id, dc]));
  const parentNumber = new Map((parents ?? []).map((dc) => [dc.id, dc.dc_number]));
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const rateByKey = new Map(
    ((rates ?? []) as ComponentRateRow[]).map((r) => [`${r.component_id}|${r.material}`, r])
  );

  const lines: BillableLine[] = rows.flatMap((row) => {
    const item = itemById.get(row.dc_item_id);
    const dc = dcById.get(row.dc_id);
    if (!item || !dc) return [];
    const sent = Number(row.billable_qty) || 0;
    const billed = Number(row.billed_qty) || 0;
    const rate = item.component_id
      ? rateByKey.get(`${item.component_id}|${item.material ?? ""}`)
      : undefined;
    return [
      {
        dcItemId: item.id,
        dcId: dc.id,
        dcNumber: dc.dc_number,
        dcDate: dc.dc_date,
        billingMonth: row.billing_month,
        customerId: row.customer_id,
        customerName: customerName.get(row.customer_id) ?? "-",
        customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
        component: componentNameOf(item, names),
        componentId: item.component_id,
        material: item.material,
        sent,
        billed,
        unbilled: Number(row.unbilled_qty) || 0,
        status: billingStatus(sent, billed),
        listRate: rate ? Number(rate.rate) : null,
        listHsn: rate?.hsn_sac ?? null,
        followUpOf: item.parent_item_id
          ? (parentNumber.get(dc.parent_dc_id ?? "") ?? "an earlier DC")
          : null,
      },
    ];
  });

  return lines
    .filter((line) => {
      if (filters.from && line.dcDate < filters.from) return false;
      if (filters.to && line.dcDate > filters.to) return false;
      if (filters.component && line.component !== filters.component) return false;
      if (filters.material && (line.material ?? "") !== filters.material) return false;
      if (filters.status && line.status !== filters.status) return false;
      if (filters.q) {
        return matchesTerm(filters.q, [
          line.dcNumber,
          ...line.customerDcNumbers,
          line.customerName,
          line.component,
          line.material,
        ]);
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.dcDate.localeCompare(b.dcDate) ||
        a.dcNumber.localeCompare(b.dcNumber, undefined, { numeric: true })
    );
}

export type MonthSummary = {
  customerId: string;
  customerName: string;
  billingMonth: string;
  sent: number;
  billed: number;
  unbilled: number;
  issuedInvoices: number;
  cancelledInvoices: number;
  issuedGst: number;
  issuedNormal: number;
  issuedTotal: number;
  paidTotal: number;
  status: MonthBillingStatus;
};

/** Billing totals per customer and month, newest month first. */
export async function fetchMonthSummaries(
  filters: { customerId?: string; billingMonth?: string; status?: string } = {}
): Promise<MonthSummary[]> {
  const supabase = await createClient();
  let query = supabase.from("customer_month_billing").select("*");
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.billingMonth) query = query.eq("billing_month", filters.billingMonth);
  const [{ data }, { data: customers }] = await Promise.all([
    query,
    supabase.from("customers").select("id, name"),
  ]);
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  return (data ?? [])
    .map((row) => {
      const sent = Number(row.sent_qty) || 0;
      const billed = Number(row.billed_qty) || 0;
      const unbilled = Number(row.unbilled_qty) || 0;
      return {
        customerId: row.customer_id,
        customerName: customerName.get(row.customer_id) ?? "-",
        billingMonth: row.billing_month,
        sent,
        billed,
        unbilled,
        issuedInvoices: Number(row.issued_invoices) || 0,
        cancelledInvoices: Number(row.cancelled_invoices) || 0,
        issuedGst: Number(row.issued_gst_invoices) || 0,
        issuedNormal: Number(row.issued_non_gst_invoices) || 0,
        issuedTotal: Number(row.issued_total) || 0,
        paidTotal: Number(row.paid_total) || 0,
        status: monthBillingStatus(sent, billed, unbilled),
      };
    })
    .filter((row) => !filters.status || row.status === filters.status)
    .sort(
      (a, b) =>
        b.billingMonth.localeCompare(a.billingMonth) || a.customerName.localeCompare(b.customerName)
    );
}

/** Which DC lines (and their DCs) each invoice bills, read through the allocations. */
async function sourcesForInvoices(supabase: Supabase, invoiceIds: string[]) {
  if (invoiceIds.length === 0) {
    return { sources: [], itemById: new Map(), dcById: new Map() } as const;
  }
  const { data: sources } = await supabase
    .from("invoice_item_sources")
    .select("*")
    .in("invoice_id", invoiceIds);
  const dcItemIds = [...new Set((sources ?? []).map((s) => s.dc_item_id))];
  const { data: dcItems } = dcItemIds.length
    ? await supabase
        .from("delivery_challan_items")
        .select("id, dc_id, component, component_id, material, sent_qty")
        .in("id", dcItemIds)
    : { data: [] };
  const dcIds = [...new Set((dcItems ?? []).map((i) => i.dc_id))];
  const { data: challans } = dcIds.length
    ? await supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, customer_dc_number")
        .in("id", dcIds)
    : { data: [] };
  return {
    sources: sources ?? [],
    itemById: new Map((dcItems ?? []).map((i) => [i.id, i])),
    dcById: new Map((challans ?? []).map((dc) => [dc.id, dc])),
  } as const;
}

export type InvoiceListRow = InvoiceRow & {
  customerName: string;
  dcNumbers: string[];
  customerDcNumbers: string[];
  components: string[];
  materials: string[];
};

export type InvoiceFilters = {
  q?: string;
  from?: string;
  to?: string;
  billingMonth?: string;
  customer?: string;
  component?: string;
  material?: string;
  status?: string;
  payment?: string;
  /** "gst" for GST tax invoices, "normal" for normal bills. */
  billType?: string;
};

/** Invoices matching the filters, newest first, with the DCs they bill. */
export async function fetchInvoiceList(filters: InvoiceFilters = {}): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("invoices")
    .select("*")
    .order("invoice_date", { ascending: false })
    .order("invoice_number", { ascending: false });
  if (filters.from) query = query.gte("invoice_date", filters.from);
  if (filters.to) query = query.lte("invoice_date", filters.to);
  if (filters.billingMonth) query = query.eq("billing_month", filters.billingMonth);
  if (filters.billType === "gst") query = query.eq("gst_bill", true);
  if (filters.billType === "normal") query = query.eq("gst_bill", false);
  if (filters.status === "issued" || filters.status === "cancelled") {
    query = query.eq("status", filters.status);
  }
  if (filters.payment === "unpaid" || filters.payment === "partial" || filters.payment === "paid") {
    query = query.eq("payment_status", filters.payment);
  }

  const [{ data: invoices }, { data: customers }] = await Promise.all([
    query,
    supabase.from("customers").select("id, name"),
  ]);
  const list = invoices ?? [];
  if (list.length === 0) return [];

  const ids = list.map((inv) => inv.id);
  const [{ data: items }, allocation] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("invoice_id, description, material, line_type")
      .in("invoice_id", ids),
    sourcesForInvoices(supabase, ids),
  ]);
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const rows: InvoiceListRow[] = list.map((inv) => {
    const own = (items ?? []).filter((i) => i.invoice_id === inv.id);
    const dcs = [
      ...new Set(
        allocation.sources
          .filter((s) => s.invoice_id === inv.id)
          .map((s) => allocation.itemById.get(s.dc_item_id)?.dc_id)
          .filter(Boolean) as string[]
      ),
    ]
      .map((id) => allocation.dcById.get(id))
      .filter(Boolean) as { dc_number: string; customer_dc_number: string[] | null }[];
    return {
      ...inv,
      customerName: customerName.get(inv.customer_id) ?? "-",
      dcNumbers: dcs
        .map((dc) => dc.dc_number)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      customerDcNumbers: [
        ...new Set(dcs.flatMap((dc) => (dc.customer_dc_number ?? []).filter(Boolean) as string[])),
      ],
      components: [
        ...new Set(own.filter((i) => i.line_type === "dc_work").map((i) => i.description)),
      ],
      materials: [...new Set(own.map((i) => i.material).filter(Boolean) as string[])],
    };
  });

  return rows.filter((row) => {
    if (filters.customer && row.customerName !== filters.customer) return false;
    if (filters.component && !row.components.includes(filters.component)) return false;
    if (filters.material && !row.materials.includes(filters.material)) return false;
    if (filters.q) {
      return matchesTerm(filters.q, [
        row.invoice_number,
        row.customerName,
        ...row.dcNumbers,
        ...row.customerDcNumbers,
        ...row.components,
        ...row.materials,
        row.status,
        row.payment_status,
      ]);
    }
    return true;
  });
}

export type InvoiceSource = {
  sourceId: string;
  dcItemId: string;
  dcId: string | null;
  dcNumber: string;
  dcDate: string | null;
  customerDcNumbers: string[];
  component: string;
  material: string | null;
  sent: number;
  quantity: number;
};

export type InvoiceWorkLine = InvoiceItemRow & { sources: InvoiceSource[] };

export type InvoiceDetail = {
  invoice: InvoiceRow;
  customerName: string;
  workLines: InvoiceWorkLine[];
  chargeLines: InvoiceItemRow[];
  dcs: { id: string; dcNumber: string; dcDate: string; customerDcNumbers: string[] }[];
};

/** One invoice with its grouped lines, each line's source DC lines, and the DCs covered. */
export async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) return null;

  const [{ data: items }, { data: customer }, allocation] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("customers").select("name").eq("id", invoice.customer_id).maybeSingle(),
    sourcesForInvoices(supabase, [id]),
  ]);

  const workLines: InvoiceWorkLine[] = (items ?? [])
    .filter((i) => i.line_type === "dc_work")
    .map((line) => ({
      ...line,
      sources: allocation.sources
        .filter((s) => s.invoice_item_id === line.id)
        .map((s) => {
          const item = allocation.itemById.get(s.dc_item_id);
          const dc = item ? allocation.dcById.get(item.dc_id) : undefined;
          return {
            sourceId: s.id,
            dcItemId: s.dc_item_id,
            dcId: dc?.id ?? null,
            dcNumber: dc?.dc_number ?? "-",
            dcDate: dc?.dc_date ?? null,
            customerDcNumbers: (dc?.customer_dc_number ?? []).filter(Boolean) as string[],
            component: item?.component ?? line.description,
            material: item?.material ?? null,
            sent: Number(item?.sent_qty) || 0,
            quantity: Number(s.quantity) || 0,
          };
        })
        .sort(
          (a, b) =>
            (a.dcDate ?? "").localeCompare(b.dcDate ?? "") ||
            a.dcNumber.localeCompare(b.dcNumber, undefined, { numeric: true })
        ),
    }));

  const dcs = [...allocation.dcById.values()]
    .map((dc) => ({
      id: dc.id,
      dcNumber: dc.dc_number,
      dcDate: dc.dc_date,
      customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean) as string[],
    }))
    .sort((a, b) => a.dcNumber.localeCompare(b.dcNumber, undefined, { numeric: true }));

  return {
    invoice,
    customerName: customer?.name ?? invoice.buyer_snapshot?.name ?? "-",
    workLines,
    chargeLines: (items ?? []).filter((i) => i.line_type === "charge"),
    dcs,
  };
}

export type DcBillingLine = {
  dcItemId: string;
  billingMonth: string;
  sent: number;
  billed: number;
  unbilled: number;
  status: BillingStatus;
  invoices: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    billingMonth: string;
    status: string;
    quantity: number;
  }[];
};

/** Billing for each line of one DC, with every invoice (issued or cancelled) that billed it. */
export async function fetchDcBilling(dcId: string): Promise<Map<string, DcBillingLine>> {
  const supabase = await createClient();
  const { data: billing } = await supabase.from("dc_line_billing").select("*").eq("dc_id", dcId);
  const itemIds = (billing ?? []).map((row) => row.dc_item_id);
  const result = new Map<string, DcBillingLine>();
  if (itemIds.length === 0) return result;

  const { data: sources } = await supabase
    .from("invoice_item_sources")
    .select("invoice_id, dc_item_id, quantity")
    .in("dc_item_id", itemIds);
  const invoiceIds = [...new Set((sources ?? []).map((s) => s.invoice_id))];
  const { data: invoices } = invoiceIds.length
    ? await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, billing_month, status")
        .in("id", invoiceIds)
    : { data: [] };
  const invoiceById = new Map((invoices ?? []).map((inv) => [inv.id, inv]));

  for (const row of billing ?? []) {
    const sent = Number(row.billable_qty) || 0;
    const billed = Number(row.billed_qty) || 0;
    result.set(row.dc_item_id, {
      dcItemId: row.dc_item_id,
      billingMonth: row.billing_month,
      sent,
      billed,
      unbilled: Number(row.unbilled_qty) || 0,
      status: billingStatus(sent, billed),
      invoices: (sources ?? [])
        .filter((s) => s.dc_item_id === row.dc_item_id)
        .flatMap((s) => {
          const inv = invoiceById.get(s.invoice_id);
          return inv
            ? [
                {
                  id: inv.id,
                  invoiceNumber: inv.invoice_number,
                  invoiceDate: inv.invoice_date,
                  billingMonth: inv.billing_month,
                  status: inv.status,
                  quantity: Number(s.quantity) || 0,
                },
              ]
            : [];
        })
        .sort((a, b) =>
          a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true })
        ),
    });
  }
  return result;
}

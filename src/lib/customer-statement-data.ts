import { createClient } from "@/lib/supabase/server";
import { componentNameIndex } from "@/lib/dc-components";
import { buildStatement, statementDate, type Statement } from "@/lib/customer-statement";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StatementFilters = {
  customerId: string;
  from: string;
  to: string;
  /** One component from the master list, or null for all. */
  componentId: string | null;
};

/** The filters from the address, or null until a customer and both dates are chosen. */
export function parseStatementFilters(search: {
  customer?: string;
  from?: string;
  to?: string;
  component?: string;
}): StatementFilters | null {
  const customerId = search.customer && UUID.test(search.customer) ? search.customer : null;
  const from = statementDate(search.from);
  const to = statementDate(search.to);
  const componentId = search.component && UUID.test(search.component) ? search.component : null;
  return customerId && from && to ? { customerId, from, to, componentId } : null;
}

/** Customers for the picker, by name. */
export async function fetchStatementCustomers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("id, name").order("name");
  return data ?? [];
}

/** Components for the picker: the master list, by name. */
export async function fetchStatementComponents(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("kind", "component")
    .order("name");
  return data ?? [];
}

/** The address of a statement, and of its printout, with the filters that are set. */
export function statementQuery(filters: StatementFilters): string {
  return new URLSearchParams({
    customer: filters.customerId,
    from: filters.from,
    to: filters.to,
    ...(filters.componentId ? { component: filters.componentId } : {}),
  }).toString();
}

/**
 * One customer's statement. Reads only: DCs, their lines, the component names
 * and the Rate List. Rates sit behind the Billing PIN, like the page itself.
 */
export async function fetchCustomerStatement(
  filters: StatementFilters
): Promise<{ customerName: string; componentName: string | null; statement: Statement } | null> {
  const supabase = await createClient();
  const [{ data: customer }, { data: dcs }, { data: picklist }, { data: rates }] =
    await Promise.all([
      supabase.from("customers").select("id, name").eq("id", filters.customerId).maybeSingle(),
      // Every DC of the customer, so a follow-up in the period can name the
      // DC it follows even when that one is older.
      supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, status, customer_dc_number, customer_dc_date")
        .eq("customer_id", filters.customerId),
      supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
      supabase.from("component_rates").select("component_id, material, rate"),
    ]);
  if (!customer) return null;

  // Filtered through the DC, not by a list of DC ids, so a customer with
  // hundreds of challans does not make an over-long request.
  const { data: items, error } = await supabase
    .from("delivery_challan_items")
    .select(
      "id, dc_id, parent_item_id, component_id, component, material, received_qty, sent_qty, sort_order, delivery_challans!inner(customer_id)"
    )
    .eq("delivery_challans.customer_id", filters.customerId);
  if (error) throw new Error(`Customer statement: ${error.message}`);

  const componentNames = componentNameIndex(picklist ?? []);
  return {
    customerName: customer.name,
    componentName: filters.componentId
      ? (componentNames.get(filters.componentId) ?? "Unknown component")
      : null,
    statement: buildStatement({
      dcs: dcs ?? [],
      items: items ?? [],
      rates: rates ?? [],
      componentNames,
      from: filters.from,
      to: filters.to,
      componentId: filters.componentId,
    }),
  };
}

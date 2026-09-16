import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CombinedDcPicker, type PickerDc } from "@/components/combined-dc-picker";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { isDraftDc, lineMoved } from "@/lib/dc-combined-print";
import { challanSettledIn, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { dcLifecycle, DC_LIFECYCLE_KEYS } from "@/lib/dc-lifecycle";
import { indiaToday } from "@/lib/india-date";
import { formatDate } from "@/lib/i18n/dates";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("dcCombined.menu") };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Combined DC Print, step one: pick an Our DC Date and a customer, then tick
 * which of that customer's issued DCs on that date to print together.
 *
 * Read-only. Only actual issued DCs are listed: never drafts, never scanned
 * customer DCs, never another customer or another date.
 */
export default async function CombinedDcPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    customer?: string;
    component?: string;
    material?: string;
  }>;
}) {
  const params = await searchParams;
  // The business date is India's, whatever time zone the server runs in.
  const date = DATE.test(params.date ?? "") ? (params.date as string) : indiaToday();
  const customerId = UUID.test(params.customer ?? "") ? (params.customer as string) : "";
  const componentFilter = params.component?.trim() ?? "";
  const materialFilter = params.material?.trim() ?? "";

  const supabase = await createClient();
  const [{ data: customers }, { lang, t }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    getTranslator(),
  ]);
  const customer = (customers ?? []).find((c) => c.id === customerId) ?? null;

  let pickerDcs: PickerDc[] = [];
  let componentOptions: string[] = [];
  let materialOptions: string[] = [];

  if (customer) {
    const [{ data: dcs }, { data: picklist }, chainRows] = await Promise.all([
      supabase
        .from("delivery_challans")
        .select("id, dc_number, dc_date, customer_id, status, customer_dc_number")
        .eq("customer_id", customer.id)
        .eq("dc_date", date)
        .neq("status", "draft")
        .order("dc_number"),
      supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
      fetchChainRows(supabase),
    ]);
    const issued = (dcs ?? []).filter((dc) => !isDraftDc(dc));
    const names = componentNameIndex(picklist ?? []);
    const chain = indexChain(chainRows);

    const withLines = issued.map((dc) => {
      const items = chainRows
        .filter((row) => row.dc_id === dc.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      return {
        dc,
        items,
        lines: items.map((i) => ({ ...i, component: componentNameOf(i, names) })),
      };
    });

    componentOptions = [
      ...new Set(withLines.flatMap((x) => x.lines.map((l) => l.component))),
    ].sort();
    materialOptions = [
      ...new Set(
        withLines.flatMap((x) => x.lines.map((l) => l.material).filter(Boolean) as string[])
      ),
    ].sort();

    pickerDcs = withLines
      .filter(
        ({ lines }) =>
          (!componentFilter || lines.some((l) => l.component === componentFilter)) &&
          (!materialFilter || lines.some((l) => l.material === materialFilter))
      )
      .map(({ dc, items, lines }) => ({
        id: dc.id,
        dcNumber: dc.dc_number,
        dcDate: formatDate(dc.dc_date, "dd MMM yyyy", lang),
        customerDcNumbers: (dc.customer_dc_number ?? []).filter(Boolean),
        statusLabel: t(
          DC_LIFECYCLE_KEYS[dcLifecycle(dc.status, items, challanSettledIn(items, chain))]
        ),
        lines: lines.map((l) => ({
          id: l.id,
          component: l.component,
          material: l.material,
          sentQty: Number(l.sent_qty) || 0,
        })),
        printableLines: lines.filter(lineMoved).length,
      }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dcCombined.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dcCombined.intro")}</p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("dcCombined.selectDate")}</span>
          <input type="date" name="date" defaultValue={date} required className={SELECT} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("dcCombined.selectCustomer")}</span>
          <select name="customer" defaultValue={customer?.id ?? ""} required className={SELECT}>
            <option value="" disabled>
              {t("dcCombined.chooseCustomer")}
            </option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("dcCombined.component")}</span>
          <select name="component" defaultValue={componentFilter} className={SELECT}>
            <option value="">{t("dcCombined.all")}</option>
            {componentOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("dcCombined.material")}</span>
          <select name="material" defaultValue={materialFilter} className={SELECT}>
            <option value="">{t("dcCombined.all")}</option>
            {materialOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" className="h-9 w-full">
            {t("dcCombined.show")}
          </Button>
        </div>
      </form>

      {!customer ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("dcCombined.chooseBoth")}
          </CardContent>
        </Card>
      ) : pickerDcs.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-8 text-center text-sm text-muted-foreground">
            <p>{t("dcCombined.noneFound", { date: formatDate(date, "dd MMM yyyy", lang) })}</p>
            <p className="text-xs">{t("dcCombined.excludedNote")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("dcCombined.foundCount", {
              customer: customer.name,
              date: formatDate(date, "dd MMM yyyy", lang),
              count: pickerDcs.length,
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("dcCombined.excludedNote")}</p>
          {/* Keyed on the query, so a new date or customer starts with nothing ticked. */}
          <CombinedDcPicker
            key={`${date}|${customer.id}|${componentFilter}|${materialFilter}`}
            dcs={pickerDcs}
          />
        </div>
      )}
    </div>
  );
}

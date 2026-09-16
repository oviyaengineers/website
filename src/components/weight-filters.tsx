"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { datePresetRange, presetFor, type DatePreset } from "@/lib/weight";
import type { WeightFilterValues } from "@/lib/weight-lines";

const KEYS = [
  "from",
  "to",
  "dc",
  "weight",
  "customer",
  "dcNo",
  "customerDcNo",
  "component",
  "material",
  "q",
] as const;

const SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9 sm:w-44";

/**
 * Filters for the Weight / Scrap list. Every value lives in the URL, so a
 * filtered list can be bookmarked or shared exactly as it is on screen.
 *
 * The quick dates come from India's date, handed in by the server, so Today
 * is the day on the wall and not the server's UTC day.
 */
export function WeightFilters({
  values,
  today,
  customers,
  components,
  materials,
}: {
  values: WeightFilterValues;
  today: string;
  customers: string[];
  components: string[];
  materials: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(changes: Partial<Record<(typeof KEYS)[number], string>>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const preset = presetFor(values.from, values.to, today);
  const anySet = KEYS.some((key) => Boolean(values[key]));
  // On a phone the full set of filters filled the first screen, so the lines
  // started below it. They fold behind one button there; the search box and
  // the quick dates stay in view. A wider screen always shows them.
  const [open, setOpen] = useState(false);
  const activeCount =
    (["dc", "weight", "customer", "dcNo", "customerDcNo", "component", "material"] as const).filter(
      (key) => Boolean(values[key])
    ).length + (!preset && (values.from || values.to) ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["today", "week", "month"] as DatePreset[]).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "default" : "outline"}
            className={`h-11 sm:h-8 ${preset === p ? "bg-[#10233f] hover:bg-[#10233f]/90" : ""}`}
            onClick={() => apply(datePresetRange(p, today))}
          >
            {p === "today"
              ? t("weight.today")
              : p === "week"
                ? t("weight.thisWeek")
                : t("weight.thisMonth")}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={!values.from && !values.to ? "default" : "outline"}
          className={`h-11 sm:h-8 ${!values.from && !values.to ? "bg-[#10233f] hover:bg-[#10233f]/90" : ""}`}
          onClick={() => apply({ from: "", to: "" })}
        >
          {t("weight.anyDate")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={open}
          className="h-11 sm:hidden"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("common.filters")}
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#10233f] px-1 text-[11px] font-semibold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </div>

      <div
        className={`${open ? "grid" : "hidden"} grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap [&_input]:h-11 sm:[&_input]:h-9`}
      >
        <Field label={t("common.from")}>
          <Input
            type="date"
            className="w-full sm:w-40"
            value={values.from ?? ""}
            onChange={(e) => apply({ from: e.target.value })}
          />
        </Field>
        <Field label={t("common.to")}>
          <Input
            type="date"
            className="w-full sm:w-40"
            value={values.to ?? ""}
            onChange={(e) => apply({ to: e.target.value })}
          />
        </Field>
        <Field label={t("weight.dcStatus")}>
          <select
            className={SELECT}
            value={values.dc === "active" || values.dc === "all" ? values.dc : ""}
            onChange={(e) => apply({ dc: e.target.value })}
          >
            <option value="">{t("weight.completedDcs")}</option>
            <option value="active">{t("weight.activeDcs")}</option>
            <option value="all">{t("weight.allIssuedDcs")}</option>
          </select>
        </Field>
        <Field label={t("weight.weightStatus")}>
          <select
            className={SELECT}
            value={values.weight ?? ""}
            onChange={(e) => apply({ weight: e.target.value })}
          >
            <option value="">{t("common.all")}</option>
            <option value="notWeighed">{t("weight.status.notWeighed")}</option>
            <option value="rateMissing">{t("weight.status.rateMissing")}</option>
            <option value="weighed">{t("weight.status.weighed")}</option>
            <option value="sentChanged">{t("weight.status.sentChanged")}</option>
          </select>
        </Field>
        <Field label={t("common.customer")}>
          <select
            className={SELECT}
            value={values.customer ?? ""}
            onChange={(e) => apply({ customer: e.target.value })}
          >
            <option value="">{t("common.allCustomers")}</option>
            {customers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <TextFilter
          label={t("weight.ourDcNo")}
          value={values.dcNo ?? ""}
          onCommit={(value) => apply({ dcNo: value })}
        />
        <TextFilter
          label={t("weight.customerDcNo")}
          value={values.customerDcNo ?? ""}
          onCommit={(value) => apply({ customerDcNo: value })}
        />
        <Field label={t("weight.component")}>
          <select
            className={SELECT}
            value={values.component ?? ""}
            onChange={(e) => apply({ component: e.target.value })}
          >
            <option value="">{t("common.allComponents")}</option>
            {components.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("common.material")}>
          <select
            className={SELECT}
            value={values.material ?? ""}
            onChange={(e) => apply({ material: e.target.value })}
          >
            <option value="">{t("weight.allMaterials")}</option>
            {materials.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        {anySet && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-9"
            onClick={() => apply(Object.fromEntries(KEYS.map((key) => [key, ""])))}
          >
            <X className="h-4 w-4" /> {t("weight.clearFilters")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Typed into freely, applied a moment after typing stops. */
function TextFilter({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  // Follows the URL when it changes from elsewhere, such as Clear filters.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (text.trim() !== value) setText(value);
  }
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => commit.current(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <Field label={label}>
      <Input className="w-full sm:w-40" value={text} onChange={(e) => setText(e.target.value)} />
    </Field>
  );
}

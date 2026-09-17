"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { datePresetRange, presetFor, type DatePreset } from "@/lib/weight";
import { WEIGHT_FILTER_KEYS, type WeightFilterValues } from "@/lib/weight-lines";

type Key = (typeof WEIGHT_FILTER_KEYS)[number];

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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(changes: Partial<Record<Key, string>>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const preset = presetFor(values.from, values.to, today);
  const anySet = WEIGHT_FILTER_KEYS.some((key) => key !== "q" && Boolean(values[key]));
  // On a phone the full set of filters filled the first screen, so they fold
  // behind one button there; the quick dates and weight states stay in view.
  const [open, setOpen] = useState(false);
  const activeCount =
    (["customer", "dcNo", "component", "material"] as const).filter((key) => Boolean(values[key]))
      .length + (!preset && (values.from || values.to) ? 1 : 0);

  const states: [string, string][] = [
    ["", "All lines"],
    ["pending", "Pending weight"],
    ["completed", "Completed weight"],
    ["notConfigured", "Not configured"],
    ["sentChanged", "Sent Qty changed"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {states.map(([value, label]) => {
          const on = (values.state ?? "") === value;
          return (
            <Button
              key={value || "all"}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              className={`h-11 sm:h-8 ${on ? "bg-[#10233f] hover:bg-[#10233f]/90" : ""}`}
              onClick={() => apply({ state: value })}
            >
              {label}
            </Button>
          );
        })}
      </div>

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
            {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={!values.from && !values.to ? "default" : "outline"}
          className={`h-11 sm:h-8 ${!values.from && !values.to ? "bg-[#10233f] hover:bg-[#10233f]/90" : ""}`}
          onClick={() => apply({ from: "", to: "" })}
        >
          Any date
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
          Filters
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
        <Field label="From">
          <Input
            type="date"
            className="w-full sm:w-40"
            value={values.from ?? ""}
            onChange={(e) => apply({ from: e.target.value })}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            className="w-full sm:w-40"
            value={values.to ?? ""}
            onChange={(e) => apply({ to: e.target.value })}
          />
        </Field>
        <TextFilter
          label="Our DC No"
          value={values.dcNo ?? ""}
          onCommit={(value) => apply({ dcNo: value })}
        />
        <Field label="Customer">
          <select
            className={SELECT}
            value={values.customer ?? ""}
            onChange={(e) => apply({ customer: e.target.value })}
          >
            <option value="">All customers</option>
            {customers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Component">
          <select
            className={SELECT}
            value={values.component ?? ""}
            onChange={(e) => apply({ component: e.target.value })}
          >
            <option value="">All components</option>
            {components.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Material">
          <select
            className={SELECT}
            value={values.material ?? ""}
            onChange={(e) => apply({ material: e.target.value })}
          >
            <option value="">All materials</option>
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
            className="col-span-2 h-11 sm:h-9"
            onClick={() =>
              apply(
                Object.fromEntries(WEIGHT_FILTER_KEYS.map((key) => [key, ""])) as Record<
                  Key,
                  string
                >
              )
            }
          >
            <X className="h-4 w-4" /> Clear filters
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

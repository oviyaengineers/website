"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export type DcFilterValues = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/**
 * Filters for a list of challans.
 *
 * Every value lives in the URL, so a filtered list can be bookmarked, sent to
 * somebody, and printed exactly as it is on screen.
 */
export function DcFilters({
  defaults,
  components = [],
}: {
  defaults: DcFilterValues;
  /** The component master list, offered as a filter. */
  components?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState({
    q: defaults.q ?? "",
    from: defaults.from ?? "",
    to: defaults.to ?? "",
    status: defaults.status ?? "",
    component: defaults.component ?? "",
  });

  function apply(next: typeof values) {
    setValues(next);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function update(patch: Partial<typeof values>) {
    apply({ ...values, ...patch });
  }

  const anySet = Object.values(values).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="DC number, customer, or their DC number..."
          className="pl-8"
          value={values.q}
          onChange={(e) => update({ q: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">From</label>
        <Input
          type="date"
          className="w-36"
          value={values.from}
          onChange={(e) => update({ from: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">To</label>
        <Input
          type="date"
          className="w-36"
          value={values.to}
          onChange={(e) => update({ to: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Status</label>
        <select
          className="h-9 w-36 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          value={values.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {components.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Component</label>
          <select
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            value={values.component}
            onChange={(e) => update({ component: e.target.value })}
          >
            <option value="">All</option>
            {components.map((component) => (
              <option key={component} value={component}>
                {component}
              </option>
            ))}
          </select>
        </div>
      )}
      {anySet && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply({ q: "", from: "", to: "", status: "", component: "" })}
        >
          <X className="h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}

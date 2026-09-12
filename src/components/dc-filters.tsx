"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export type DcFilterValues = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/** The filter keys this bar owns. The search term is not one of them. */
const KEYS = ["from", "to", "status", "component"] as const;

/**
 * Date, status and component filters for a list of challans.
 *
 * Every value lives in the URL, so a filtered list can be bookmarked, sent to
 * somebody, and printed exactly as it is on screen.
 *
 * The search term is deliberately not handled here. It has its own box, and
 * this bar merges into whatever is already in the URL rather than rebuilding
 * it, so filtering never drops a search and searching never drops a filter.
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
  const params = useSearchParams();

  function update(key: (typeof KEYS)[number], value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const key of KEYS) next.delete(key);
    next.delete("q");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const anySet = Boolean(
    defaults.from || defaults.to || defaults.status || defaults.component || defaults.q
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">From</label>
        <Input
          type="date"
          className="w-36"
          value={defaults.from ?? ""}
          onChange={(e) => update("from", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">To</label>
        <Input
          type="date"
          className="w-36"
          value={defaults.to ?? ""}
          onChange={(e) => update("to", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Status</label>
        <select
          className="h-9 w-36 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          value={defaults.status ?? ""}
          onChange={(e) => update("status", e.target.value)}
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
            className="h-9 w-full max-w-[18rem] rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:w-56"
            value={defaults.component ?? ""}
            onChange={(e) => update("component", e.target.value)}
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
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}

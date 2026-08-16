"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function DcFilters({
  defaults,
}: {
  defaults: { q?: string; from?: string; to?: string; status?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState({
    q: defaults.q ?? "",
    from: defaults.from ?? "",
    to: defaults.to ?? "",
    status: defaults.status ?? "",
  });

  function update(patch: Partial<typeof values>) {
    const next = { ...values, ...patch };
    setValues(next);
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.status) params.set("status", next.status);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search DC # or customer..."
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
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
        </select>
      </div>
    </div>
  );
}

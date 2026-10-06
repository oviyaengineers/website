"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WeightArchiveFilters({ today }: { today: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  function apply(nextFrom: string, nextTo: string) {
    const query = new URLSearchParams(params.toString());
    if (nextFrom) query.set("from", nextFrom);
    else query.delete("from");
    if (nextTo) query.set("to", nextTo);
    else query.delete("to");
    router.replace(query.size ? `/dashboard/weight/history?${query}` : "/dashboard/weight/history", {
      scroll: false,
    });
  }

  function setMonth(value: string) {
    if (!value) return apply("", "");
    const [year, month] = value.split("-");
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    apply(`${year}-${month}-01`, `${year}-${month}-${String(last).padStart(2, "0")}`);
  }

  const selectedMonth = from && to && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : "";
  const currentMonth = today.slice(0, 7);
  const monthStart = `${currentMonth}-01`;
  const [year, month] = currentMonth.split("-");
  const monthEnd = `${currentMonth}-${String(new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Month
        <Input
          className="h-11 w-full sm:h-9 sm:w-44"
          type="month"
          value={selectedMonth}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        From date
        <Input className="h-11 w-full sm:h-9 sm:w-40" type="date" value={from} onChange={(event) => apply(event.target.value, to)} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        To date
        <Input className="h-11 w-full sm:h-9 sm:w-40" type="date" value={to} onChange={(event) => apply(from, event.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          onClick={() => apply(monthStart, monthEnd)}
        >
          <CalendarDays className="h-4 w-4" /> This month
        </Button>
        {(from || to) && (
          <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => apply("", "")}>
            <X className="h-4 w-4" /> All dates
          </Button>
        )}
      </div>
    </div>
  );
}

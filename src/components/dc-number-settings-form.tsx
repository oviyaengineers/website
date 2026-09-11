"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDcNumberSeriesAction } from "@/lib/actions/dc-numbering";
import { financialYearLabel, previewDcNumber } from "@/lib/dc-numbering";
import type { DcNumberSeriesRow } from "@/types/database";

/**
 * Where the DC series is pointed next.
 *
 * Only the next number is editable. Numbers already issued are not stored
 * here and are never rewritten by a change on this screen — moving the serial
 * back over a used number is allowed, and the allocator simply steps past
 * anything already taken.
 */
export function DcNumberSettingsForm({ series }: { series: DcNumberSeriesRow }) {
  const [state, formAction, pending] = useActionState(updateDcNumberSeriesAction, {
    error: null,
  });
  const [prefix, setPrefix] = useState(series.prefix);
  const [fyLabel, setFyLabel] = useState(series.fy_label);
  const [padding, setPadding] = useState(series.padding);
  const [nextSerial, setNextSerial] = useState(series.next_serial);

  const preview = previewDcNumber({
    prefix,
    fy_label: fyLabel,
    padding: Number.isFinite(padding) ? padding : 3,
    next_serial: Number.isFinite(nextSerial) ? nextSerial : 1,
  });
  const thisYear = financialYearLabel();

  // The page does not navigate on save, so the toast is the only confirmation
  // that the series actually moved.
  useEffect(() => {
    if (state.saved) toast.success("DC numbering saved.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="fy_label">Financial year</Label>
          <Input
            id="fy_label"
            name="fy_label"
            value={fyLabel}
            onChange={(e) => setFyLabel(e.target.value)}
            placeholder="26-27"
          />
          <p className="text-xs text-muted-foreground">
            This year is {thisYear}. April starts a new one.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="next_serial">Next serial</Label>
          <Input
            id="next_serial"
            name="next_serial"
            type="number"
            min="1"
            value={nextSerial}
            onChange={(e) => setNextSerial(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            The number the next challan takes. Already-issued numbers are skipped.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="padding">Serial digits</Label>
          <Input
            id="padding"
            name="padding"
            type="number"
            min="1"
            max="8"
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">3 prints 1 as 001.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prefix">Prefix (optional)</Label>
          <Input
            id="prefix"
            name="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="none"
          />
          <p className="text-xs text-muted-foreground">Printed before the year.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Next challan will be numbered
        </p>
        <p className="mt-1 font-mono text-xl font-semibold text-[#10233f]">{preview}</p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="bg-[#10233f] hover:bg-[#10233f]/90">
        {pending ? "Saving..." : "Save numbering"}
      </Button>
    </form>
  );
}

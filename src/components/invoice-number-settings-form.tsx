"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveInvoiceSeriesAction } from "@/lib/actions/billing";
import { formatInvoiceNumber, nextFreeInvoiceNumber } from "@/lib/billing";
import type { InvoiceNumberSeriesRow } from "@/types/database";

/**
 * Where one series goes next: GST tax invoices or normal bills. Separate from
 * DC numbering and from each other. Each series has its own prefix, year,
 * serial and digit count. Numbers already on an invoice are never rewritten
 * and are skipped if reached again, and the preview shows the next free one.
 */
export function InvoiceNumberSettingsForm({
  series,
  used,
}: {
  series: InvoiceNumberSeriesRow;
  /** Every number already on an invoice, issued or cancelled. */
  used: string[];
}) {
  const [state, formAction, pending] = useActionState(saveInvoiceSeriesAction, { error: null });
  const [prefix, setPrefix] = useState(series.prefix);
  const [fyLabel, setFyLabel] = useState(series.fy_label);
  const [padding, setPadding] = useState(series.padding);
  const [nextSerial, setNextSerial] = useState(series.next_serial);
  const label = series.kind === "gst" ? "GST tax invoice" : "normal bill";
  useEffect(() => {
    if (state.saved) {
      toast.success(
        state.nextNumber
          ? `Saved. The next ${label} will be ${state.nextNumber}.`
          : `Numbering for ${label}s saved.`
      );
    }
  }, [state, label]);

  const usedSet = useMemo(() => new Set(used), [used]);
  const id = (name: string) => `${series.kind}-${name}`;
  const typed = {
    prefix,
    fy_label: fyLabel,
    padding: Number.isFinite(padding) && padding > 0 ? padding : 3,
    next_serial: Number.isFinite(nextSerial) && nextSerial > 0 ? nextSerial : 1,
  };
  const asTyped = formatInvoiceNumber(typed);
  const preview = nextFreeInvoiceNumber(typed, usedSet);
  const resetPreview = nextFreeInvoiceNumber({ ...typed, next_serial: 1 }, usedSet);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="kind" value={series.kind} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={id("prefix")}>Prefix</Label>
          <Input
            id={id("prefix")}
            name="prefix"
            value={prefix}
            maxLength={16}
            pattern="[A-Za-z0-9]{1,16}"
            onChange={(e) => setPrefix(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Letters or numbers; a hyphen is added after it.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("fy_label")}>Financial year</Label>
          <Input
            id={id("fy_label")}
            name="fy_label"
            value={fyLabel}
            onChange={(e) => setFyLabel(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">For example 26-27 or 26/27.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("next_serial")}>Next serial</Label>
          <Input
            id={id("next_serial")}
            name="next_serial"
            type="number"
            min="1"
            value={nextSerial}
            onChange={(e) => setNextSerial(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">Set 1 to start again from 001.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("padding")}>Serial digits</Label>
          <Input
            id={id("padding")}
            name="padding"
            type="number"
            min="1"
            max="8"
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Next {label} will be numbered
        </p>
        <p className="mt-1 font-mono text-xl font-semibold text-[#10233f]">{preview}</p>
        {preview !== asTyped ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {asTyped} is already used on an invoice, so the first free number after it is taken.
          </p>
        ) : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="bg-[#10233f] hover:bg-[#10233f]/90">
          {pending ? "Saving..." : "Save numbering"}
        </Button>
        <Button
          type="submit"
          name="reset_to_one"
          value="true"
          variant="outline"
          disabled={pending}
          onClick={(event) => {
            const confirmed = window.confirm(
              `Reset ${label} numbering from ${resetPreview}? Existing bills will keep their current numbers. Any number already used will be skipped.`
            );
            if (!confirmed) {
              event.preventDefault();
              return;
            }
            setNextSerial(1);
          }}
        >
          Reset series
        </Button>
      </div>
    </form>
  );
}

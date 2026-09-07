"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  findCustomerDcRefs,
  type CustomerDcRefOption,
  type StoredDcMatch,
} from "@/lib/actions/dc-lookup";
import { formatDcDate, StoredDcMatchList } from "@/components/dc-ref-lookup";

/**
 * Offers the customer DC numbers already on file for the selected customer,
 * narrowed by date once one is chosen.
 *
 * Picking one fills the reference and hands the stored challan back so its
 * components and received quantities can be copied into the item rows — the
 * operator is recording the same inward goods, so re-typing them is wasted
 * work and a chance to mistype.
 */
export function CustomerDcRefPicker({
  customerId,
  date,
  excludeDcId,
  onPick,
}: {
  customerId: string;
  date: string;
  excludeDcId?: string | null;
  onPick: (option: CustomerDcRefOption) => void;
}) {
  const [options, setOptions] = useState<CustomerDcRefOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<StoredDcMatch | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (!customerId) {
        if (!cancelled) {
          setOptions([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const found = await findCustomerDcRefs({ customerId, date, excludeDcId });
        if (!cancelled) setOptions(found);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerId, date, excludeDcId]);

  if (!customerId) return null;

  if (loading && options.length === 0) {
    return (
      <span className="flex h-11 w-11 items-center justify-center text-muted-foreground md:h-8 md:w-8">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }

  if (options.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPreview(null);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 md:size-8"
            aria-label={`Choose from ${options.length} stored customer DC number${
              options.length === 1 ? "" : "s"
            }`}
          />
        }
      >
        <ChevronDown className="h-4 w-4" />
      </PopoverTrigger>

      <PopoverContent align="start" className="max-h-96 w-[24rem] overflow-y-auto p-0">
        <div className="border-b bg-muted/50 px-3 py-2">
          <p className="text-sm font-medium">Stored customer DC numbers</p>
          <p className="text-xs text-muted-foreground">
            {date.trim()
              ? `On file for this customer dated ${formatDcDate(date)}.`
              : "On file for this customer. Pick a date to narrow the list."}
          </p>
        </div>

        <ul className="divide-y">
          {options.map((option) => (
            <li key={`${option.match.id}-${option.number}-${option.date}`}>
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{option.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDcDate(option.date)} · {option.match.dc_number} ·{" "}
                    {option.match.items.length} item
                    {option.match.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(preview?.id === option.match.id ? null : option.match)}
                >
                  {preview?.id === option.match.id ? "Hide" : "Details"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#10233f] hover:bg-[#10233f]/90"
                  onClick={() => {
                    onPick(option);
                    setOpen(false);
                    setPreview(null);
                  }}
                >
                  Use
                </Button>
              </div>

              {preview?.id === option.match.id && (
                <div className="border-t bg-muted/30">
                  <StoredDcMatchList matches={[option.match]} />
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          “Use” fills the reference and copies the stored components and received quantities.
          Nothing is saved until you submit this form.
        </p>
      </PopoverContent>
    </Popover>
  );
}

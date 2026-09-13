"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A dropdown that can be typed into, for picking from a master list.
 *
 * Only the listed options can be chosen. There is no "use what I typed": a
 * component or material has to exist in Settings, so a misreading can be
 * corrected to the real entry but never becomes an entry of its own.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Type to search...",
  emptyText = "Nothing matches.",
  disabled = false,
  invalid = false,
  allowClear = false,
  className,
  ariaLabel,
}: {
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Drawn in the error colour, for a value that still needs choosing. */
  invalid?: boolean;
  allowClear?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    // Every typed word must appear, in any order: "cf8m 40fb" finds
    // "3P DN40FB/50RB CF8M Body Casting REV 2".
    return options.filter((option) => {
      const hay = option.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className={cn(
              "h-auto min-h-8 w-full justify-between whitespace-normal py-1.5 text-left font-normal",
              invalid && "border-destructive text-destructive",
              className
            )}
          />
        }
      >
        <span className={cn("min-w-0 break-words", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] min-w-[16rem] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {allowClear && value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          )}
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
          )}
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  value === option ? "opacity-100" : "opacity-0"
                )}
              />
              {option}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

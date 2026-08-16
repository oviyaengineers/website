"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DatePicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className="w-full justify-start font-normal" />
        }
      >
        <CalendarIcon className="h-4 w-4" />
        <span className={cn(!date && "text-muted-foreground")}>
          {date ? format(date, "dd MMM yyyy") : "Pick a date"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
                d.getDate()
              ).padStart(2, "0")}`;
              onChange(iso);
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

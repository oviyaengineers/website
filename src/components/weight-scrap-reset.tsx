"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { archiveAndResetWeightScrapAction } from "@/lib/actions/weight";

function monthRange(today: string) {
  const [year, month] = today.split("-");
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, "0")}` };
}

export function WeightScrapReset({ today }: { today: string }) {
  const initial = monthRange(today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function reset() {
    startTransition(async () => {
      try {
        const result = await archiveAndResetWeightScrapAction(from, to);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.archived} recorded ${result.archived === 1 ? "line" : "lines"} archived. The selected list is ready for fresh entry.`);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not archive and reset the list.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11 sm:h-9" />}>
        <RotateCcw className="h-4 w-4" /> Archive & reset
      </DialogTrigger>
      <DialogContent closeLabel="Close" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive and reset Weight / Scrap</DialogTitle>
          <DialogDescription>
            Recorded lines for DC dates in this range will be copied to Scrap History, then cleared
            from the active records so you can enter them again. The original DCs and quantities
            will not change.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            DC date from
            <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            DC date to
            <Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Defaults to this month. You can choose a single day or any date range.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={pending || !from || !to || from > to} onClick={reset}>
            <Archive className="h-4 w-4" /> {pending ? "Archiving…" : "Archive and reset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

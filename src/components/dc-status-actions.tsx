"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateDcStatusAction } from "@/lib/actions/dc";
import type { DcStatus } from "@/types/database";
import { Truck, PackageCheck } from "lucide-react";

const nextStatus: Record<DcStatus, DcStatus | null> = {
  draft: "dispatched",
  dispatched: "delivered",
  delivered: null,
};

const nextLabel: Record<Exclude<DcStatus, "delivered">, string> = {
  draft: "Mark as Dispatched",
  dispatched: "Mark as Delivered",
};

export function DcStatusActions({ id, status }: { id: string; status: DcStatus }) {
  const [pending, startTransition] = useTransition();
  const target = nextStatus[status];
  if (!target) return null;

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await updateDcStatusAction(id, target);
            toast.success(`Marked as ${target}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update status");
          }
        })
      }
    >
      {status === "draft" ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
      {pending ? "Updating..." : nextLabel[status as "draft" | "dispatched"]}
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { deletePicklistItemAction } from "@/lib/actions/dc-picklists";

export function DeletePicklistItemButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-muted-foreground hover:text-destructive"
      disabled={pending}
      aria-label={`Remove ${name}`}
      onClick={() =>
        startTransition(async () => {
          try {
            await deletePicklistItemAction(id);
            toast.success(`Removed "${name}"`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to remove");
          }
        })
      }
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

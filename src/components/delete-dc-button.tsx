"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { deleteDcAction } from "@/lib/actions/dc";
import { Trash2 } from "lucide-react";

export function DeleteDcButton({ id, dcNumber }: { id: string; dcNumber: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  // Deleting from the list leaves the operator on the list, which is right.
  // Deleting from the challan's own page used to leave them on a 404, because
  // the page they were standing on had just been removed.
  const onItsOwnPage = pathname.startsWith(`/dashboard/dc/${id}`);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete delivery challan</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{dcNumber}&quot;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteDcAction(id);
                  toast.success("Delivery challan deleted");
                  // replace, not push: the deleted challan must not be sitting
                  // in history for the back button to return to.
                  if (onItsOwnPage) router.replace("/dashboard/dc");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to delete");
                }
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

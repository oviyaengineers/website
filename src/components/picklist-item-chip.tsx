"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeletePicklistItemButton } from "@/components/delete-picklist-item-button";
import { renamePicklistItemAction } from "@/lib/actions/dc-picklists";
import type { DcPicklistKind } from "@/types/database";

/**
 * One dropdown entry, with its name editable in place.
 *
 * Scanning reads part numbers off a photograph and gets them wrong often
 * enough — a zero for a letter O, "Flg" for "Fig" — that a misspelling
 * reaching this list was previously permanent: the only remedy was to delete
 * the entry and type it again, losing it from any challan that used it.
 */
export function PicklistItemChip({
  id,
  name,
  kind,
}: {
  id: string;
  name: string;
  kind: DcPicklistKind;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = draft.trim();
    if (!next) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (next === name) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await renamePicklistItemAction(id, kind, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      toast.success(
        result.renamedRows > 0
          ? `Renamed, and updated ${result.renamedRows} challan row${
              result.renamedRows === 1 ? "" : "s"
            } that used it.`
          : "Renamed."
      );
    });
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1 rounded-full border bg-background py-1 pl-2 pr-1">
        <Input
          value={draft}
          autoFocus
          disabled={pending}
          aria-label={`Rename ${name}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="h-7 w-64 max-w-[70vw] text-sm"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-emerald-700"
          aria-label="Save name"
          disabled={pending}
          onClick={save}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          aria-label="Cancel rename"
          disabled={pending}
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm">
      {name}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        aria-label={`Rename ${name}`}
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DeletePicklistItemButton id={id} name={name} kind={kind} />
    </span>
  );
}

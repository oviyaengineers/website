"use client";

import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Switches the component being looked at.
 *
 * Navigation rather than a filter: each component has its own address, so a
 * part's ledger can be bookmarked and sent to somebody. Selecting only moves
 * between them and changes nothing.
 */
export function ComponentPicker({
  components,
  current,
}: {
  components: { id: string; name: string }[];
  /** The component being viewed, by id. */
  current?: string;
}) {
  const router = useRouter();
  // Selected by name, navigated by id. The trigger renders whatever the value
  // is, so keying on the id printed the uuid where the part name belongs.
  const byName = new Map(components.map((c) => [c.name, c.id]));
  const currentName = components.find((c) => c.id === current)?.name ?? null;

  return (
    <div className="flex items-center gap-2">
      <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        value={currentName}
        onValueChange={(name) => {
          const id = name ? byName.get(name) : null;
          if (id) router.push(`/dashboard/dc/component/${id}`);
        }}
      >
        <SelectTrigger className="w-full sm:w-[28rem]">
          <SelectValue placeholder="Choose a component..." />
        </SelectTrigger>
        <SelectContent>
          {components.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No components in Settings yet.
            </div>
          )}
          {components.map((component) => (
            <SelectItem key={component.id} value={component.name}>
              {component.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

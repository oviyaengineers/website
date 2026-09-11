import type { DeliveryChallanItemRow } from "@/types/database";

/**
 * The name to show for a challan item.
 *
 * Where the row carries a component id, the master list decides the spelling,
 * so renaming a part in Settings reaches every challan that uses it at once.
 * The stored text is the fallback, for a row written before migration 0018 or
 * one whose component has since been removed from the list.
 */
export function componentNameOf(
  item: Pick<DeliveryChallanItemRow, "component" | "component_id">,
  namesById: Map<string, string>
): string {
  if (item.component_id) {
    const current = namesById.get(item.component_id);
    if (current) return current;
  }
  return item.component;
}

/** Component ids to their current names, for componentNameOf. */
export function componentNameIndex(
  picklist: { id: string; name: string; kind?: string }[]
): Map<string, string> {
  return new Map(
    picklist
      .filter((row) => row.kind === undefined || row.kind === "component")
      .map((row) => [row.id, row.name])
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { useI18n } from "@/components/i18n-provider";

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
  const { t } = useI18n();
  const currentName = current ?? null;

  return (
    <div className="flex items-center gap-2">
      <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
      <SearchableSelect
        options={components.map((component) => ({ label: component.name, value: component.id }))}
        value={currentName}
        onChange={(id) => {
          if (id) router.push(`/dashboard/dc/component/${id}`);
        }}
        searchPlaceholder={t("dcForm.searchComponents")}
        emptyText={t("dcViews.noComponents")}
        placeholder={t("dcViews.chooseComponent")}
        className="min-h-11 w-full sm:w-[28rem]"
        ariaLabel={t("common.component")}
      />
    </div>
  );
}

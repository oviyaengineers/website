"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { saveRateAction, deleteRateAction } from "@/lib/actions/billing";

const NO_MATERIAL = "(no material)";

/** Adds a rate, or replaces the rate for a component + material already listed. */
export function RateListForm({
  components,
  materials,
}: {
  components: { id: string; name: string }[];
  materials: string[];
}) {
  const [state, formAction, pending] = useActionState(saveRateAction, { error: null });
  const [component, setComponent] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  useEffect(() => {
    if (state.saved) toast.success("Rate saved.");
  }, [state]);
  const componentId = components.find((c) => c.name === component)?.id ?? "";

  return (
    <form
      action={formAction}
      className="grid gap-3 sm:grid-cols-[1.5fr_1fr_140px_140px_auto] sm:items-end"
    >
      <input type="hidden" name="component_id" value={componentId} />
      <input
        type="hidden"
        name="material"
        value={material && material !== NO_MATERIAL ? material : ""}
      />
      <div className="space-y-1">
        <Label>Component</Label>
        <SearchableSelect
          options={components.map((c) => c.name)}
          value={component}
          onChange={setComponent}
          searchPlaceholder="Search components..."
          ariaLabel="Component"
        />
      </div>
      <div className="space-y-1">
        <Label>Material</Label>
        <SearchableSelect
          options={[NO_MATERIAL, ...materials]}
          value={material}
          onChange={setMaterial}
          searchPlaceholder="Search materials..."
          ariaLabel="Material"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rate">Rate per piece (₹)</Label>
        <Input id="rate" name="rate" type="number" min="0" step="any" className="h-11 sm:h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hsn_sac">HSN/SAC</Label>
        <Input id="hsn_sac" name="hsn_sac" className="h-11 sm:h-9" />
      </div>
      <Button type="submit" disabled={pending || !componentId || !material} className="h-11 sm:h-9">
        {pending ? "Saving..." : "Save rate"}
      </Button>
      {state.error ? <p className="text-sm text-destructive sm:col-span-5">{state.error}</p> : null}
    </form>
  );
}

export function DeleteRateButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const { error } = await deleteRateAction(id);
        setPending(false);
        if (error) {
          toast.error(error);
          return;
        }
        toast.success(`Removed the rate for ${label}. Issued invoices keep their rates.`);
        router.refresh();
      }}
    >
      Remove
    </Button>
  );
}

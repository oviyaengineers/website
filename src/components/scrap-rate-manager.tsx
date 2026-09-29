"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveScrapMaterialRateAction } from "@/lib/actions/weight";

type MaterialRate = { id: string; name: string; ratePerKg: number | null };

export function ScrapRateManager({
  materials,
  canEdit,
}: {
  materials: MaterialRate[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newMaterial, setNewMaterial] = useState("");
  const [newRate, setNewRate] = useState("");
  function save(input: { materialId?: string; materialName?: string; rateText: string }, done?: () => void) {
    startTransition(async () => {
      const result = await saveScrapMaterialRateAction(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Scrap rate saved.");
      done?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            save({ materialName: newMaterial, rateText: newRate }, () => {
              setNewMaterial("");
              setNewRate("");
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="scrap-material">Material</Label>
            <Input
              id="scrap-material"
              value={newMaterial}
              onChange={(event) => setNewMaterial(event.target.value)}
              placeholder="Enter a material name"
              className="h-11 sm:h-9"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scrap-new-rate">Scrap rate per kg (₹)</Label>
            <Input
              id="scrap-new-rate"
              type="number"
              min="0"
              step="0.01"
              value={newRate}
              onChange={(event) => setNewRate(event.target.value)}
              className="h-11 tabular-nums sm:h-9"
              required
            />
          </div>
          <Button type="submit" disabled={pending} className="h-11 bg-[#10233f] sm:h-9">
            <Plus className="h-4 w-4" /> {pending ? "Saving..." : "Add material"}
          </Button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Material</th>
              <th className="px-3 py-2.5 text-right font-medium">Scrap rate per kg (₹)</th>
              {canEdit && <th className="px-3 py-2.5 text-right font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <ScrapRateRow
                key={`${material.id}:${material.ratePerKg ?? "unset"}`}
                material={material}
                canEdit={canEdit}
                pending={pending}
                onSave={(rateText) => save({ materialId: material.id, rateText })}
              />
            ))}
            {materials.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 3 : 2} className="p-8 text-center text-muted-foreground">
                  No materials yet. Add a material and its scrap rate above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScrapRateRow({
  material,
  canEdit,
  pending,
  onSave,
}: {
  material: MaterialRate;
  canEdit: boolean;
  pending: boolean;
  onSave: (rateText: string) => void;
}) {
  const [rateText, setRateText] = useState(
    material.ratePerKg == null ? "" : String(material.ratePerKg)
  );
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2.5 font-medium">{material.name}</td>
      <td className="px-3 py-2.5">
        {canEdit ? (
          <Input
            aria-label={`${material.name} scrap rate per kg`}
            type="number"
            min="0"
            step="0.01"
            value={rateText}
            onChange={(event) => setRateText(event.target.value)}
            className="ml-auto h-10 max-w-48 text-right tabular-nums sm:h-9"
          />
        ) : (
          <p className="text-right tabular-nums">
            {material.ratePerKg == null ? "—" : `₹${material.ratePerKg.toFixed(2)}`}
          </p>
        )}
      </td>
      {canEdit && (
        <td className="px-3 py-2.5 text-right">
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            disabled={pending || !rateText.trim()}
            onClick={() => onSave(rateText)}
          >
            <Save className="h-4 w-4" /> Save
          </Button>
        </td>
      )}
    </tr>
  );
}

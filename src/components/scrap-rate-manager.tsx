"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveScrapRatePeriodAction,
  saveScrapMaterialRateAction,
} from "@/lib/actions/weight";
import { scrapRateGroupKey } from "@/lib/scrap-rate-groups";

type MaterialRate = { id: string; name: string; ratePerKg: number | null };
type RatePeriod = {
  id: string;
  material_group: string;
  effective_from: string;
  effective_to: string;
  rate_per_kg: number;
  approved_at: string;
};

export function ScrapRateManager({
  materials,
  periods,
  canEdit,
}: {
  materials: MaterialRate[];
  periods: RatePeriod[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newMaterial, setNewMaterial] = useState("");
  const [newRate, setNewRate] = useState("");
  const [periodMaterial, setPeriodMaterial] = useState("");
  const [periodRate, setPeriodRate] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
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

  const groups = Array.from(
    materials.reduce((map, material) => {
      const key = scrapRateGroupKey(material.name);
      const group = map.get(key) ?? [];
      group.push(material);
      map.set(key, group);
      return map;
    }, new Map<string, MaterialRate[]>())
  );
  const groupOptions = groups.map(([key, rows]) => ({
    key,
    id: rows[0].id,
    label: key === "a105-wcb" ? "A105 / WCB" : rows[0].name,
  }));
  const groupLabel = (key: string) =>
    key === "a105-wcb" ? "A105 / WCB" : materials.find((m) => scrapRateGroupKey(m.name) === key)?.name ?? key;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Approve rate for DC dates</h2>
          <p className="text-sm text-muted-foreground">
            Rates apply to the DC date, including both selected dates. You can reapprove earlier dates; the newest approval applies there and earlier approvals stay in history.
          </p>
        </div>
        {canEdit && (
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await approveScrapRatePeriodAction({
                  materialId: periodMaterial,
                  rateText: periodRate,
                  from: periodFrom,
                  to: periodTo,
                });
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Rate approved for the selected DC dates.");
                setPeriodRate("");
                setPeriodFrom("");
                setPeriodTo("");
                router.refresh();
              });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="period-material">Material</Label>
              <select
                id="period-material"
                value={periodMaterial}
                onChange={(event) => setPeriodMaterial(event.target.value)}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm sm:h-9"
                required
              >
                <option value="">Choose material</option>
                {groupOptions.map((group) => (
                  <option key={group.key} value={group.id}>{group.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-rate">Scrap rate per kg (₹)</Label>
              <Input id="period-rate" type="number" min="0" step="0.01" value={periodRate} onChange={(event) => setPeriodRate(event.target.value)} required className="h-11 sm:h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-from">From date</Label>
              <Input id="period-from" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} required className="h-11 sm:h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to">To date</Label>
              <Input id="period-to" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} required className="h-11 sm:h-9" />
            </div>
            <Button type="submit" disabled={pending || !periodMaterial} className="h-11 bg-[#10233f] sm:h-9">
              <CalendarCheck className="h-4 w-4" /> {pending ? "Approving..." : "Approve rate"}
            </Button>
          </form>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Material</th><th className="px-3 py-2.5 font-medium">From</th><th className="px-3 py-2.5 font-medium">To</th><th className="px-3 py-2.5 text-right font-medium">Scrap rate/kg</th><th className="px-3 py-2.5 font-medium">Approved</th>
            </tr></thead>
            <tbody>
              {periods.map((period) => <tr key={period.id} className="border-b last:border-0">
                <td className="px-3 py-2.5 font-medium">{groupLabel(period.material_group)}</td>
                <td className="px-3 py-2.5">{period.effective_from}</td><td className="px-3 py-2.5">{period.effective_to}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">₹{Number(period.rate_per_kg).toFixed(2)}</td>
                <td className="px-3 py-2.5">{new Date(period.approved_at).toLocaleDateString("en-IN")}</td>
              </tr>)}
              {periods.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No approved date-based rates yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

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

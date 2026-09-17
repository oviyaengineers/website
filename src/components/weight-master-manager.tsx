"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Power, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
import {
  deleteWeightMasterAction,
  saveWeightMasterAction,
  setWeightMasterActiveAction,
} from "@/lib/actions/weight";
import type { WeightMasterItem } from "@/lib/weight-data";
import {
  formatWeightIn,
  MASTER_PROBLEM_TEXT,
  masterScrapMg,
  milligramsInUnit,
  validateMasterEntry,
  type WeightUnit,
} from "@/lib/weight";

type Status = "active" | "inactive" | "all";

type FormState = {
  id: string | null;
  component: string | null;
  material: string | null;
  unit: WeightUnit;
  roughText: string;
  finishedText: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  id: null,
  component: null,
  material: null,
  unit: "kg",
  roughText: "",
  finishedText: "",
  isActive: true,
};

const mg = (grams: number) => Math.round(grams * 1000);

/**
 * The Weight/Scrap Master: one record per Component + Material.
 *
 * Scrap per piece is shown as worked out and cannot be typed. Editing a record
 * never changes DC lines already recorded; they keep their own copy. A record
 * that has been used can be made inactive but not deleted.
 */
export function WeightMasterManager({
  items,
  components,
  materials,
  canEdit,
}: {
  items: WeightMasterItem[];
  components: { id: string; name: string }[];
  materials: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [attempted, setAttempted] = useState(false);

  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      (status === "all" || (status === "active") === item.isActive) &&
      (!needle ||
        item.componentName.toLowerCase().includes(needle) ||
        item.material.toLowerCase().includes(needle))
  );

  function openNew() {
    setForm({ ...EMPTY });
    setAttempted(false);
  }

  function openEdit(item: WeightMasterItem) {
    setForm({
      id: item.id,
      component: item.componentName,
      material: item.material,
      unit: item.unit,
      roughText: milligramsInUnit(mg(item.roughG), item.unit),
      finishedText: milligramsInUnit(mg(item.finishedG), item.unit),
      isActive: item.isActive,
    });
    setAttempted(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function run(
    action: () => Promise<{ error: string | null }>,
    success: string,
    after?: () => void
  ) {
    startTransition(async () => {
      const { error } = await action();
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setAttempted(true);
    const componentId = components.find((c) => c.name === form.component)?.id;
    if (!form.id && (!componentId || !form.material)) {
      toast.error("Choose a component and a material.");
      return;
    }
    const problems = validateMasterEntry(form);
    if (problems.length > 0) {
      toast.error(MASTER_PROBLEM_TEXT[problems[0]]);
      return;
    }
    const editing = form.id !== null;
    run(
      () =>
        saveWeightMasterAction({
          id: form.id ?? undefined,
          componentId: componentId ?? "",
          material: form.material ?? "",
          unit: form.unit,
          roughText: form.roughText,
          finishedText: form.finishedText,
          isActive: form.isActive,
        }),
      editing
        ? "Master updated. DC lines already recorded keep their recorded weights."
        : "Master added.",
      () => setForm(null)
    );
  }

  const problems = form ? validateMasterEntry(form) : [];
  const scrap = form ? masterScrapMg(form) : null;
  const duplicate =
    form && !form.id && form.component && form.material
      ? items.find(
          (item) =>
            item.componentName === form.component &&
            item.material.trim().toLowerCase() === form.material!.trim().toLowerCase()
        )
      : undefined;

  return (
    <div className="space-y-4">
      {canEdit && form && (
        <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{form.id ? "Edit master" : "Add new master"}</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 sm:h-8"
              onClick={() => setForm(null)}
              disabled={pending}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Component</Label>
              {form.id ? (
                <p className="flex min-h-11 items-center rounded-md border bg-muted px-3 text-sm sm:min-h-9">
                  {form.component}
                </p>
              ) : (
                <SearchableSelect
                  options={components.map((c) => c.name)}
                  value={form.component}
                  onChange={(component) => setForm({ ...form, component })}
                  searchPlaceholder="Search components..."
                  placeholder="Choose a component"
                  ariaLabel="Component"
                  invalid={attempted && !form.component}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Material</Label>
              {form.id ? (
                <p className="flex min-h-11 items-center rounded-md border bg-muted px-3 text-sm sm:min-h-9">
                  {form.material}
                </p>
              ) : (
                <SearchableSelect
                  options={materials}
                  value={form.material}
                  onChange={(material) => setForm({ ...form, material })}
                  searchPlaceholder="Search materials..."
                  placeholder="Choose a material"
                  ariaLabel="Material"
                  invalid={attempted && !form.material}
                />
              )}
            </div>
          </div>
          {form.id && (
            <p className="text-xs text-muted-foreground">
              Component and material stay fixed on an existing master. For a different pair, add a
              new master.
            </p>
          )}
          {duplicate && (
            <p className="text-sm text-destructive">
              A master for this component and material already exists.{" "}
              <button type="button" className="underline" onClick={() => openEdit(duplicate)}>
                Edit it instead
              </button>
              .
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <Label>Weight unit</Label>
              <div
                role="group"
                aria-label="Weight unit"
                className="flex overflow-hidden rounded-md border"
              >
                {(["g", "kg"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={form.unit === u}
                    onClick={() => setForm({ ...form, unit: u })}
                    className={`h-11 flex-1 text-sm font-medium sm:h-9 ${
                      form.unit === u
                        ? "bg-[#10233f] text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wm-rough">Rough / piece ({form.unit})</Label>
              <Input
                id="wm-rough"
                inputMode="decimal"
                value={form.roughText}
                aria-invalid={
                  (attempted || form.roughText !== "") &&
                  problems.some(
                    (p) => p.startsWith("rough") || p === "finishedOverRough" || p === "negative"
                  )
                    ? true
                    : undefined
                }
                onChange={(e) => setForm({ ...form, roughText: e.target.value })}
                className="h-11 tabular-nums sm:h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wm-finished">Finished / piece ({form.unit})</Label>
              <Input
                id="wm-finished"
                inputMode="decimal"
                value={form.finishedText}
                aria-invalid={
                  (attempted || form.finishedText !== "") &&
                  problems.some((p) => p.startsWith("finished") || p === "negative")
                    ? true
                    : undefined
                }
                onChange={(e) => setForm({ ...form, finishedText: e.target.value })}
                className="h-11 tabular-nums sm:h-9"
              />
            </div>
            <div className="space-y-1">
              <Label>Scrap / piece (auto)</Label>
              <p
                aria-live="polite"
                className="flex h-11 items-center rounded-md border border-dashed bg-muted px-3 font-semibold tabular-nums sm:h-9"
              >
                {scrap === null ? "—" : formatWeightIn(scrap, form.unit)}
              </p>
            </div>
          </div>
          {problems.length > 0 &&
            (attempted || (form.roughText !== "" && form.finishedText !== "")) && (
              <ul className="space-y-0.5 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{MASTER_PROBLEM_TEXT[p]}</li>
                ))}
              </ul>
            )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active (used for new Weight / Scrap records)
          </label>

          <Button
            type="submit"
            disabled={pending || Boolean(duplicate)}
            className="h-11 bg-[#10233f] px-6 hover:bg-[#10233f]/90 sm:h-9"
          >
            {pending ? "Saving..." : form.id ? "Save changes" : "Add master"}
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-80">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search component or material"
              aria-label="Search component or material"
              className="h-11 pl-9 sm:h-9"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={status === s ? "default" : "outline"}
                className={`h-11 sm:h-8 ${status === s ? "bg-[#10233f] hover:bg-[#10233f]/90" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? "All" : s === "active" ? "Active" : "Inactive"}
              </Button>
            ))}
          </div>
        </div>
        {canEdit && !form && (
          <Button
            type="button"
            onClick={openNew}
            className="h-11 bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
          >
            <Plus className="h-4 w-4" /> Add new
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "No masters yet. Every DC line shows “Weight not configured” until its component and material have one."
            : "No masters match."}
        </p>
      ) : (
        <>
          {/* A phone gets one card per master; a wider screen the table. */}
          <div className="space-y-3 md:hidden">
            {shown.map((item) => (
              <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{item.componentName}</p>
                    <p className="text-xs text-muted-foreground">{item.material}</p>
                  </div>
                  <StatusBadge active={item.isActive} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
                  <div>
                    <dt>Rough / pc</dt>
                    <dd>{formatWeightIn(mg(item.roughG), item.unit)}</dd>
                  </div>
                  <div>
                    <dt>Finished / pc</dt>
                    <dd>{formatWeightIn(mg(item.finishedG), item.unit)}</dd>
                  </div>
                  <div>
                    <dt>Scrap / pc</dt>
                    <dd className="font-semibold">{formatWeightIn(mg(item.scrapG), item.unit)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">{usedText(item.usedBy)}</p>
                {canEdit && (
                  <RowActions item={item} pending={pending} onEdit={openEdit} run={run} />
                )}
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium">
                  <th>Component</th>
                  <th>Material</th>
                  <th className="text-right">Rough / pc</th>
                  <th className="text-right">Finished / pc</th>
                  <th className="text-right">Scrap / pc</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Used</th>
                  {canEdit && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 [&_td]:px-3 [&_td]:py-2.5">
                    <td>{item.componentName}</td>
                    <td>{item.material}</td>
                    <td className="text-right tabular-nums">
                      {formatWeightIn(mg(item.roughG), item.unit)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatWeightIn(mg(item.finishedG), item.unit)}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatWeightIn(mg(item.scrapG), item.unit)}
                    </td>
                    <td>{item.unit}</td>
                    <td>
                      <StatusBadge active={item.isActive} />
                    </td>
                    <td className="text-xs text-muted-foreground">{usedText(item.usedBy)}</td>
                    {canEdit && (
                      <td className="text-right">
                        <RowActions item={item} pending={pending} onEdit={openEdit} run={run} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function usedText(count: number): string {
  return count === 0
    ? "Not used yet"
    : count === 1
      ? "Used by 1 DC line"
      : `Used by ${count} DC lines`;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${
        active
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

function RowActions({
  item,
  pending,
  onEdit,
  run,
}: {
  item: WeightMasterItem;
  pending: boolean;
  onEdit: (item: WeightMasterItem) => void;
  run: (action: () => Promise<{ error: string | null }>, success: string) => void;
}) {
  const label = `${item.componentName} / ${item.material}`;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-8"
        disabled={pending}
        onClick={() => onEdit(item)}
      >
        <Pencil className="h-4 w-4" /> Edit
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-8"
        disabled={pending}
        onClick={() =>
          run(
            () => setWeightMasterActiveAction(item.id, !item.isActive),
            item.isActive
              ? `${label} is inactive. New records will say it is not configured.`
              : `${label} is active.`
          )
        }
      >
        <Power className="h-4 w-4" /> {item.isActive ? "Deactivate" : "Activate"}
      </Button>
      {item.usedBy === 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 text-destructive hover:text-destructive sm:h-8"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Delete the master for ${label}? It has not been used.`)) return;
            run(() => deleteWeightMasterAction(item.id), `Deleted the master for ${label}.`);
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
    </div>
  );
}

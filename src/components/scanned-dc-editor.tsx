"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateScannedDc, type ScannedDc } from "@/lib/actions/dc-scan-queue";

/**
 * Corrections to a scanned customer DC before our challan is raised from it.
 *
 * OCR gets a digit wrong often enough that this is the difference between
 * fixing a reference here and photographing the challan again. Editing stops
 * once the scan is converted: from that point the figures live on our
 * challan, and that is where they are changed.
 */
export function ScannedDcEditor({
  scan,
  components,
  materials,
}: {
  scan: ScannedDc;
  components: string[];
  materials: string[];
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [number, setNumber] = useState(scan.customerDcNumber ?? "");
  const [date, setDate] = useState(scan.customerDcDate ?? "");
  const [items, setItems] = useState(scan.items);

  const editable = scan.status === "pending";

  function setItem(index: number, patch: Partial<(typeof items)[number]>) {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function save() {
    startSaving(async () => {
      const { error } = await updateScannedDc(scan.id, {
        customerDcNumber: number,
        customerDcDate: date,
        items,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Scan updated. It is still waiting under Scanned DCs.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Customer DC</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 [&_button]:h-11 [&_input]:h-11 sm:grid-cols-2 sm:[&_button]:h-8 sm:[&_input]:h-8">
          <div className="space-y-2">
            <Label htmlFor="customer_dc_number">Customer DC number</Label>
            <Input
              id="customer_dc_number"
              value={number}
              disabled={!editable}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Customer DC date</Label>
            {/* DatePicker takes no disabled prop; a converted scan is read
                only, so the date simply shows as text. */}
            {editable ? (
              <DatePicker value={date} onChange={setDate} />
            ) : (
              <Input value={date || "No date read"} disabled />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#10233f]">Received from the customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Only the received quantity is recorded here. Sent, material
              problem and rejection belong to our challan and start at zero,
              because none of that has happened at scanning time. */}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items were read from this scan.</p>
          )}
          {items.map((item, index) => (
            // A thumb's height on a phone: this is where a misread name or
            // quantity is put right, standing at the bench with the paper.
            <div
              key={index}
              className="grid gap-2 rounded-lg border p-3 [&_input]:h-11 [&_[data-slot=select-trigger]]:h-11 sm:[&_[data-slot=select-trigger]]:h-8 sm:grid-cols-[1fr_180px_120px] sm:items-end sm:border-0 sm:p-0 sm:[&_input]:h-8"
            >
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Select
                  value={item.component || null}
                  disabled={!editable}
                  onValueChange={(v) => setItem(index, { component: v ?? "" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* The name read off the paper is offered even when it is
                        not on the master list yet, so editing never silently
                        drops what was scanned. */}
                    {[...new Set([item.component, ...components].filter(Boolean))].map((c) => (
                      <SelectItem key={c} value={c as string}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Material</Label>
                <Select
                  value={item.material || null}
                  disabled={!editable}
                  onValueChange={(v) => setItem(index, { material: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([item.material, ...materials].filter(Boolean))].map((m) => (
                      <SelectItem key={m} value={m as string}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Received</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={item.received_qty}
                  disabled={!editable}
                  onChange={(e) => setItem(index, { received_qty: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {editable ? (
        <div className="flex flex-wrap gap-2 [&>*]:h-11 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">
          <Button onClick={save} disabled={saving} variant="outline">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save corrections"}
          </Button>
          <Button
            render={<Link href={`/dashboard/dc/new?scan=${scan.id}`} />}
            className="bg-[#10233f] hover:bg-[#10233f]/90"
          >
            <FilePlus2 className="h-4 w-4" /> Create delivery challan
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Our delivery challan has already been created from this.</p>
          <p className="mt-1 text-muted-foreground">
            The figures now live on that challan, so they are edited there rather than here.
          </p>
          {scan.dcId && (
            <Button
              render={<Link href={`/dashboard/dc/${scan.dcId}`} />}
              variant="outline"
              className="mt-3"
            >
              Open {scan.dcNumber ?? "the delivery challan"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

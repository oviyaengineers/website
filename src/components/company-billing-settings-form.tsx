"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCompanySettingsAction } from "@/lib/actions/billing";
import type { CompanyBillingSettingsRow } from "@/types/database";

const FIELDS: {
  name: keyof CompanyBillingSettingsRow;
  label: string;
  hint?: string;
  area?: boolean;
  required?: boolean;
}[] = [
  { name: "legal_name", label: "Company legal name", required: true },
  { name: "gstin", label: "Company GSTIN", hint: "15 letters and digits.", required: true },
  {
    name: "state",
    label: "State",
    hint: "Customers in this state get CGST + SGST; others IGST.",
    required: true,
  },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "address", label: "Address", area: true },
  { name: "bank_name", label: "Bank name" },
  { name: "bank_account_name", label: "Account name" },
  { name: "bank_account_number", label: "Account number" },
  { name: "bank_ifsc", label: "IFSC" },
  { name: "bank_branch", label: "Branch" },
  { name: "default_hsn_sac", label: "Default HSN/SAC", hint: "Used when the Rate List has none." },
  {
    name: "default_gst_rate",
    label: "Default GST rate (%)",
    hint: "Pre-filled on new invoices; can be changed per invoice.",
  },
  { name: "authorized_signatory", label: "Authorized signatory name" },
  { name: "payment_terms", label: "Payment terms", area: true },
];

/** The business's own billing details. Nothing is pre-filled or assumed. */
export function CompanyBillingSettingsForm({
  settings,
}: {
  settings: CompanyBillingSettingsRow | null;
}) {
  const [state, formAction, pending] = useActionState(saveCompanySettingsAction, { error: null });
  useEffect(() => {
    if (state.saved) toast.success("Billing details saved.");
  }, [state]);

  return (
    <form action={formAction} className="grid max-w-4xl gap-4 sm:grid-cols-2">
      {FIELDS.map((field) => {
        const value = settings?.[field.name];
        const defaultValue = value === null || value === undefined ? "" : String(value);
        return (
          <div key={field.name} className={`space-y-1 ${field.area ? "sm:col-span-2" : ""}`}>
            <Label htmlFor={field.name}>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            {field.area ? (
              <Textarea id={field.name} name={field.name} rows={3} defaultValue={defaultValue} />
            ) : (
              <Input
                id={field.name}
                name={field.name}
                defaultValue={defaultValue}
                type={field.name === "default_gst_rate" ? "number" : "text"}
                step={field.name === "default_gst_rate" ? "any" : undefined}
                className="h-11 sm:h-9"
              />
            )}
            {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
          </div>
        );
      })}
      {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 bg-[#10233f] hover:bg-[#10233f]/90 sm:h-9"
        >
          {pending ? "Saving..." : "Save billing details"}
        </Button>
      </div>
    </form>
  );
}

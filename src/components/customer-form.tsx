"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";
import type { CustomerRow } from "@/types/database";
import type { CustomerFormState } from "@/lib/actions/customers";

export function CustomerForm({
  customer,
  action,
}: {
  customer?: CustomerRow;
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="name">{t("customers.nameRequired")}</Label>
        <Input id="name" name="name" required defaultValue={customer?.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact_person">{t("customers.contactPerson")}</Label>
          <Input
            id="contact_person"
            name="contact_person"
            defaultValue={customer?.contact_person ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("customers.phone")}</Label>
          <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">{t("customers.email")}</Label>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gst_number">{t("customers.gstin")}</Label>
          <Input id="gst_number" name="gst_number" defaultValue={customer?.gst_number ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="state">{t("customers.state")}</Label>
        <Input
          id="state"
          name="state"
          defaultValue={customer?.state ?? ""}
          placeholder={t("customers.statePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("customers.stateHelp")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">{t("customers.address")}</Label>
        <Textarea id="address" name="address" rows={3} defaultValue={customer?.address ?? ""} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending
          ? t("common.saving")
          : customer
            ? t("dcForm.saveChanges")
            : t("customers.createCustomer")}
      </Button>
    </form>
  );
}

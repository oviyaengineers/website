"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createPicklistItemAction, type PicklistFormState } from "@/lib/actions/dc-picklists";
import type { DcPicklistKind } from "@/types/database";

export function PicklistAddForm({ kind, label }: { kind: DcPicklistKind; label: string }) {
  const boundAction = createPicklistItemAction.bind(null, kind) as (
    state: PicklistFormState,
    formData: FormData
  ) => Promise<PicklistFormState>;
  const [state, formAction, pending] = useActionState(boundAction, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <Input name="name" placeholder={`Add ${label.toLowerCase()}...`} required />
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

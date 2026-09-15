"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

/** Opens the browser print dialog. Hidden on the printed sheet itself. */
export function PrintNowButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="print:hidden">
      <Button onClick={() => window.print()} variant="outline">
        <Printer className="h-4 w-4" /> {label ?? t("dcForm.printThisList")}
      </Button>
    </div>
  );
}

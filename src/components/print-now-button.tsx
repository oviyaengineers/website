"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog. Hidden on the printed sheet itself. */
export function PrintNowButton({ label = "Print this list" }: { label?: string }) {
  return (
    <div className="print:hidden">
      <Button onClick={() => window.print()} variant="outline">
        <Printer className="h-4 w-4" /> {label}
      </Button>
    </div>
  );
}

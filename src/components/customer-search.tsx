"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function CustomerSearch({ defaultValue }: { defaultValue: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={t("customers.search")}
        className="pl-8"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const params = new URLSearchParams();
          if (e.target.value) params.set("q", e.target.value);
          router.replace(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
}

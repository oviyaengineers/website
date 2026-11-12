"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

/** Ask browsers that support print page margins to leave out their own headers and footers. */
export function PrintFooterOption() {
  const { t } = useI18n();
  const [hide, setHide] = useState(true);

  useEffect(() => {
    document.body.dataset.printBrowserFooter = hide ? "hide" : "show";
    return () => {
      delete document.body.dataset.printBrowserFooter;
    };
  }, [hide]);

  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm print:hidden">
      <input
        type="checkbox"
        checked={hide}
        onChange={(event) => {
          const next = event.target.checked;
          document.body.dataset.printBrowserFooter = next ? "hide" : "show";
          setHide(next);
        }}
        className="size-4 accent-[#10233f]"
      />
      <span>
        {t("dcPrint.hideBrowserFooter")}
        <span className="ml-1 text-xs text-muted-foreground">
          {t("dcPrint.browserFooterHint")}
        </span>
      </span>
    </label>
  );
}

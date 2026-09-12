"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Back, forward and refresh for the dashboard itself.
 *
 * The app is used on phones and on a shop-floor tablet, where the browser's
 * own chrome is often hidden or awkward to reach, and several screens open as
 * full-page overlays with no other way out. These sit in the header so moving
 * between screens never depends on the browser's buttons.
 *
 * Back and forward stay enabled. The App Router does not report whether there
 * is anywhere to go, and `history.length` counts entries from before this app
 * was opened, so a disabled state would be guesswork. A press with nowhere to
 * go does nothing, which is the same as the browser's own behaviour.
 */
export function HistoryNav() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label="Go back"
        title="Back"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label="Go forward"
        title="Forward"
        onClick={() => router.forward()}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
      {/* Re-reads this screen from the database. The router keeps a rendered
          copy of a screen already visited, so a challan entered on the tablet
          can take a moment to show up on the phone standing next to it. This
          is how somebody asks for the figures again without losing the page
          they are on. The spinner is the answer to "did that do anything",
          since a screen whose figures have not changed looks identical. */}
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label="Refresh this screen"
        title="Refresh"
        disabled={refreshing}
        onClick={() => startRefresh(() => router.refresh())}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}

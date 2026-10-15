"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

const PAGE_WIDTH_PX = (210 / 25.4) * 96;
const PAGE_HEIGHT_PX = (297 / 25.4) * 96;

function fitScale() {
  return Math.min(1, Math.max(0.25, (window.innerWidth - 32) / PAGE_WIDTH_PX));
}

export function InvoicePreviewZoom({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateFit = () => setScale(fitScale());
    updateFit();
    window.addEventListener("resize", updateFit);
    return () => window.removeEventListener("resize", updateFit);
  }, []);

  return (
    <>
      <div className="invoice-preview-zoom-controls print:hidden" aria-label="Invoice preview zoom">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setScale((value) => Math.max(0.25, value - 0.05))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setScale((value) => Math.min(1, value + 0.05))}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setScale(fitScale())}>Fit</button>
        <button type="button" onClick={() => setScale(1)}>100%</button>
        <span className="text-xs text-muted-foreground">View only</span>
      </div>
      <div className="invoice-print-stage invoice-preview-stage">
        <div className="invoice-zoom-scroll">
          <div
            className="invoice-zoom-frame"
            style={{ width: PAGE_WIDTH_PX * scale, height: PAGE_HEIGHT_PX * scale }}
          >
            <div
              className="invoice-zoom-content"
              style={{ transform: `scale(${scale})` }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

const MIN_ZOOM = 25;
const MAX_ZOOM = 300;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function PrintPreviewZoom({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(100);
  const [zoomText, setZoomText] = useState("100");
  const fitToWidth = useRef(true);

  const fit = useCallback(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!content || !scroll) return;

    const width = content.offsetWidth;
    const height = content.offsetHeight;
    if (!width || !height) return;

    setSize({ width, height });
    const nextZoom = clampZoom(Math.floor(((scroll.clientWidth - 32) / width) * 100));
    setZoom(nextZoom);
    setZoomText(String(nextZoom));
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!content || !scroll) return;

    const measure = () => {
      const width = content.offsetWidth;
      const height = content.offsetHeight;
      if (!width || !height) return;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
      if (fitToWidth.current) {
        const nextZoom = clampZoom(Math.floor(((scroll.clientWidth - 32) / width) * 100));
        setZoom(nextZoom);
        setZoomText(String(nextZoom));
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(scroll);
    measure();
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  function changeZoom(value: number) {
    fitToWidth.current = false;
    const nextZoom = clampZoom(value);
    setZoom(nextZoom);
    setZoomText(String(nextZoom));
  }

  function commitZoom() {
    const parsed = Number(zoomText);
    if (!Number.isFinite(parsed)) {
      setZoomText(String(zoom));
      return;
    }
    changeZoom(parsed);
  }

  return (
    <>
      <div className="print-preview-zoom-controls print:hidden" aria-label="Print preview zoom">
        <button type="button" aria-label="Zoom out" onClick={() => changeZoom(zoom - 10)}>
          <Minus className="h-4 w-4" />
        </button>
        <label className="print-preview-zoom-input">
          <span className="sr-only">Zoom percentage</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={5}
            value={zoomText}
            onChange={(event) => {
              const value = event.target.value;
              setZoomText(value);
              if (value && Number.isFinite(Number(value))) {
                fitToWidth.current = false;
                setZoom(clampZoom(Number(value)));
              }
            }}
            onBlur={commitZoom}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Zoom percentage"
          />
          <span aria-hidden="true">%</span>
        </label>
        <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom + 10)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => {
          fitToWidth.current = true;
          fit();
        }}>
          Fit width
        </button>
        <button type="button" onClick={() => changeZoom(100)}>100%</button>
      </div>
      <div className="print-preview-zoom-scroll" ref={scrollRef}>
        <div
          className="print-preview-zoom-frame"
          style={{ width: size.width * (zoom / 100), height: size.height * (zoom / 100) }}
        >
          <div
            ref={contentRef}
            className="print-preview-zoom-content"
            data-zoom={zoom / 100}
            style={{ transform: `scale(${zoom / 100})` }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

const STORAGE_KEY = "oviya-dashboard-page-zoom";
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const listeners = new Set<() => void>();

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));
}

function getSavedZoom() {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM ? saved : 100;
  } catch {
    return 100;
  }
}

function subscribeToZoom(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function storeZoom(value: number) {
  const nextZoom = clampZoom(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, String(nextZoom));
  } catch {
    // The setting remains in the mounted page if browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
  return nextZoom;
}

export function DashboardPageZoom({ children }: { children: ReactNode }) {
  const zoom = useSyncExternalStore(subscribeToZoom, getSavedZoom, () => 100);
  const [editing, setEditing] = useState(false);
  const [zoomText, setZoomText] = useState("100");

  function changeZoom(value: number) {
    const nextZoom = storeZoom(value);
    setZoomText(String(nextZoom));
  }

  function commitZoom() {
    const parsed = Number(zoomText);
    if (Number.isFinite(parsed) && zoomText.trim()) changeZoom(parsed);
    else setZoomText(String(zoom));
  }

  return (
    <>
      <div className="dashboard-page-zoom-controls" aria-label="Page zoom controls">
        <span className="dashboard-page-zoom-title">Page zoom</span>
        <button type="button" aria-label="Zoom out" onClick={() => changeZoom(zoom - 10)}>
          <Minus className="h-4 w-4" />
        </button>
        <label className="dashboard-page-zoom-input">
          <span className="sr-only">Page zoom percentage</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={5}
            value={editing ? zoomText : String(zoom)}
            onFocus={() => {
              setEditing(true);
              setZoomText(String(zoom));
            }}
            onChange={(event) => {
              const value = event.target.value;
              setZoomText(value);
              if (value.trim() && Number.isFinite(Number(value))) {
                storeZoom(Number(value));
              }
            }}
            onBlur={() => {
              commitZoom();
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Page zoom percentage"
          />
          <span aria-hidden="true">%</span>
        </label>
        <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom + 10)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => changeZoom(100)}>Reset</button>
      </div>
      <div
        className="dashboard-page-zoom-content"
        style={{
          zoom: zoom / 100,
          width: `${(100 * 100) / zoom}%`,
        }}
      >
        {children}
      </div>
    </>
  );
}

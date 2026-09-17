"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, CheckCircle2, ImageUp, Loader2, RotateCcw, ScanQrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import {
  framePixels,
  loadZxing,
  nativeQrDetector,
  readQrFromImage,
  scratchCanvas,
} from "@/lib/qr/decode";
import { publicDcPathFromQr } from "@/lib/qr/public-link-match";
import type { TranslationKey } from "@/lib/i18n/types";

type Status =
  | "starting"
  | "scanning"
  | "detected"
  | "denied"
  | "noCamera"
  | "unsupported"
  | "cameraError"
  | "readingImage";

/** How long "not one of our codes" stays up before scanning carries on quietly. */
const NOT_OURS_MS = 2500;

/**
 * Camera QR scanner for the printed DC codes.
 *
 * Detection starts on the first camera frame and runs on every frame after
 * that, one read at a time so a slow phone never queues work up. The first
 * code that is one of our public challan links wins: scanning stops, the
 * camera is released and the public page opens. Later detections are ignored,
 * so one scan can never navigate twice. The link itself is never shown.
 */
export function QrScanner() {
  const { t } = useI18n();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Set once a code has been accepted; everything after that is ignored. */
  const doneRef = useRef(false);
  const runRef = useRef(0);
  const [status, setStatus] = useState<Status>("starting");
  const [notOurs, setNotOurs] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const notOursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /** Returns true when the text was one of ours and navigation has begun. */
  const accept = useCallback(
    (texts: string[]): boolean => {
      if (doneRef.current) return true;
      for (const text of texts) {
        const path = publicDcPathFromQr(text, window.location.host);
        if (path) {
          doneRef.current = true;
          stopCamera();
          setStatus("detected");
          router.push(path);
          return true;
        }
      }
      if (texts.length > 0) {
        setNotOurs(true);
        if (notOursTimer.current) clearTimeout(notOursTimer.current);
        notOursTimer.current = setTimeout(() => setNotOurs(false), NOT_OURS_MS);
      }
      return false;
    },
    [router, stopCamera]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    doneRef.current = false;
    setNotOurs(false);
    setImageFailed(false);
    setStatus("starting");
    const run = runRef.current;

    // Loaded alongside the camera permission prompt, not after it.
    const zxingReady = loadZxing().catch(() => null);
    const nativeReady = nativeQrDetector();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // The rear camera on a phone; a laptop simply uses its only one.
          facingMode: { ideal: "environment" },
          // Enough pixels for a 2 cm code at arm's length, without the
          // per-frame cost of full sensor resolution.
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "noCamera"
            : "cameraError"
      );
      return;
    }
    if (run !== runRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    // Continuous autofocus where the camera offers it, so a moving hand stays sharp.
    const [track] = stream.getVideoTracks();
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
      });
    } catch {
      // Not every camera supports it; the default is fine.
    }

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      setStatus("cameraError");
      return;
    }
    if (run !== runRef.current) return;
    setStatus("scanning");

    const native = await nativeReady;
    const target = scratchCanvas();
    let frame = 0;

    const tick = async () => {
      if (run !== runRef.current || doneRef.current) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width > 0 && height > 0) {
        frame += 1;
        try {
          if (native) {
            const found = await native.detect(video);
            if (accept(found.map((f) => f.rawValue))) return;
          }
          // ZXing on every frame without a native reader, and on every third
          // frame alongside it. It alternates the whole view with the centre at
          // full resolution, which is what finds a small code held far away.
          const zxing = !native || frame % 3 === 0 ? await zxingReady : null;
          if (zxing && run === runRef.current && !doneRef.current) {
            const centre = frame % 2 === 0;
            const pixels = framePixels(
              target,
              video,
              width,
              height,
              centre ? 0.6 : 1,
              centre ? 1280 : 960
            );
            if (accept(await zxing(pixels, false))) return;
          }
        } catch {
          // A frame that could not be read is simply skipped.
        }
      }
      schedule();
    };

    const schedule = () => {
      if (run !== runRef.current || doneRef.current) return;
      const v = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => void tick());
      else requestAnimationFrame(() => void tick());
    };
    schedule();
  }, [accept, stopCamera]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => void startCamera());
    return () => {
      cancelAnimationFrame(raf);
      stopCamera();
      if (notOursTimer.current) clearTimeout(notOursTimer.current);
    };
  }, [startCamera, stopCamera]);

  async function chooseImage(file: File | undefined) {
    if (!file || doneRef.current) return;
    stopCamera();
    setImageFailed(false);
    setNotOurs(false);
    setStatus("readingImage");
    try {
      const texts = await readQrFromImage(file);
      if (accept(texts)) return;
      setImageFailed(texts.length === 0);
    } catch {
      setImageFailed(true);
    }
    setStatus("cameraError");
  }

  const cameraProblem: Partial<Record<Status, TranslationKey>> = {
    denied: "qrScan.permissionDenied",
    noCamera: "qrScan.noCamera",
    unsupported: "qrScan.unsupported",
    cameraError: "qrScan.cameraStopped",
  };
  const problemKey = cameraProblem[status];
  const cameraLive = status === "starting" || status === "scanning";

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black sm:aspect-square">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${cameraLive ? "" : "opacity-30"}`}
        />
        {/* A target to aim at; the whole frame is read, not just this box. */}
        {cameraLive && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
          <p
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow ${
              status === "detected" ? "bg-green-600 text-white" : "bg-white/95 text-[#10233f]"
            }`}
          >
            {status === "detected" ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> {t("qrScan.detected")}
              </>
            ) : status === "readingImage" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("qrScan.readingImage")}
              </>
            ) : status === "starting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("qrScan.starting")}
              </>
            ) : status === "scanning" ? (
              <>
                <ScanQrCode className="h-4 w-4 animate-pulse" /> {t("qrScan.scanning")}
              </>
            ) : (
              <>
                <CameraOff className="h-4 w-4" /> {t("qrScan.cameraOff")}
              </>
            )}
          </p>
        </div>
      </div>

      {notOurs && (
        <p className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("qrScan.notOurs")}
        </p>
      )}
      {imageFailed && (
        <p className="rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {t("qrScan.imageNoQr")}
        </p>
      )}
      {problemKey && !imageFailed && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">{t(problemKey)}</p>
      )}

      {status !== "detected" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <ImageUp className="h-4 w-4" /> {t("qrScan.chooseImage")}
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                void chooseImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {!cameraLive && status !== "readingImage" && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void startCamera()}
            >
              <RotateCcw className="h-4 w-4" /> {t("qrScan.retryCamera")}
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("qrScan.tip")}</p>
    </div>
  );
}

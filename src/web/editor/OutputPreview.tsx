"use client";

import React, { useRef, useState, useEffect, useId, useCallback } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { FunnyMoment, type VideoProps } from "@/video/FunnyMoment";
import type { Edit } from "@/shared/edit";
import { CANVAS, FPS } from "@/shared/edit";
import { compileEdit } from "@/shared/timeline";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faRotateLeft } from "@fortawesome/free-solid-svg-icons";

type OutputPreviewProps = {
  edit: Edit;
  sourceUrl: string;
  assetUrls: Record<string, string>;
  /** Output-frame seek requested by the parent/timeline. */
  currentFrame?: number;
  onFrameUpdate?: (frame: number) => void;
  onMediaError?: (message: string | null) => void;
};

export const OutputPreview: React.FC<OutputPreviewProps> = (props) => (
  <OutputMedia key={`${props.edit.assetId}-${props.sourceUrl}`} {...props} />
);

const OutputMedia: React.FC<OutputPreviewProps> = ({ edit, sourceUrl, assetUrls, currentFrame, onFrameUpdate, onMediaError }) => {
  const id = useId();
  const playerRef = useRef<PlayerRef>(null);
  const callbacks = useRef({ onFrameUpdate, onMediaError });
  useEffect(() => { callbacks.current = { onFrameUpdate, onMediaError }; }, [onFrameUpdate, onMediaError]);
  const lastReportedFrame = useRef<number | null>(null);
  const failedMedia = useRef(new Set<EventTarget>());
  const fatalPlayerError = useRef(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(sourceUrl ? null : "Sumber preview belum tersedia. Tunggu proxy video atau muat ulang proyek.");
  const durationInFrames = Math.max(1, compileEdit(edit).durationFrames);
  const reportPlayerError = useCallback((error: Error) => {
    fatalPlayerError.current = true;
    const message = `Preview gagal: ${error.message}. Coba muat ulang preview; periksa proxy sumber dan aset stiker/SFX.`;
    setMediaError(message);
    setIsRetrying(false);
    callbacks.current.onMediaError?.(message);
  }, []);

  useEffect(() => {
    if (fatalPlayerError.current || failedMedia.current.size > 0) return;
    callbacks.current.onMediaError?.(sourceUrl ? null : "Sumber preview belum tersedia. Tunggu proxy video atau muat ulang proyek.");
  }, [sourceUrl]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      lastReportedFrame.current = detail.frame;
      callbacks.current.onFrameUpdate?.(detail.frame);
    };
    const onError = ({ detail }: { detail: { error: Error } }) => {
      reportPlayerError(detail.error);
    };
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("error", onError);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("error", onError);
    };
  }, [retryVersion, reportPlayerError]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const requested = currentFrame ?? player.getCurrentFrame();
    if (!Number.isFinite(requested)) return;
    const target = Math.max(0, Math.min(durationInFrames - 1, Math.round(requested)));
    // A frame echoed from playback is not a new seek request.
    if (target === player.getCurrentFrame()) return;
    if (target === lastReportedFrame.current && requested === target) return;
    player.seekTo(target);
  }, [currentFrame, durationInFrames, retryVersion]);

  const videoProps: VideoProps = { edit, sourceUrl, assetUrls };
  const retry = () => {
    lastReportedFrame.current = null;
    failedMedia.current.clear();
    fatalPlayerError.current = false;
    setMediaError(null);
    setIsRetrying(true);
    setRetryVersion((version) => version + 1);
  };
  const mediaReady = (target: EventTarget) => {
    failedMedia.current.delete(target);
    if (fatalPlayerError.current || failedMedia.current.size > 0) return;
    setMediaError(null);
    setIsRetrying(false);
    callbacks.current.onMediaError?.(null);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel relative flex min-w-0 flex-col items-center gap-3 rounded-lg border border-border bg-background p-3 text-foreground">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Preview Vertikal 9:16</h2>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowSafeArea((show) => !show)} aria-pressed={showSafeArea} className="h-auto min-h-9 whitespace-normal type-control text-muted-foreground">
          <FontAwesomeIcon aria-hidden="true" icon={showSafeArea ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
          {showSafeArea ? "Sembunyikan Panduan" : "Panduan Area Aman"}
        </Button>
      </div>
      {isRetrying && <p role="status" className="w-full type-help text-muted-foreground">Memuat ulang preview…</p>}
      {mediaError && <div role="alert" className="flex w-full flex-col gap-2 type-help text-rose-400">
        <p>{mediaError}</p>
        <Button type="button" size="sm" variant="outline" onClick={retry} disabled={!sourceUrl} className="w-fit type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faRotateLeft} /> Coba Muat Ulang Preview
        </Button>
      </div>}
      <div
        className="relative aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md border border-border bg-black"
        onErrorCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLMediaElement) && !(target instanceof HTMLImageElement)) return;
          failedMedia.current.add(target);
          const message = "Media preview gagal dimuat. Coba muat ulang preview; pastikan proxy sumber dan aset stiker/SFX masih tersedia.";
          setMediaError(message);
          setIsRetrying(false);
          callbacks.current.onMediaError?.(message);
        }}
        onLoadedDataCapture={(event) => mediaReady(event.target)}
        onLoadCapture={(event) => { if (event.target instanceof HTMLImageElement) mediaReady(event.target); }}
      >
        <Player
          key={retryVersion} ref={playerRef} component={FunnyMoment} inputProps={videoProps}
          durationInFrames={durationInFrames} compositionWidth={CANVAS.width} compositionHeight={CANVAS.height} fps={FPS}
          style={{ width: "100%", height: "100%" }} controls alwaysShowControls autoPlay={false} loop
          errorFallback={({ error }) => <PreviewFailure error={error} onError={reportPlayerError} />}
        />
        {showSafeArea && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 border-2 border-dashed border-primary/60">
          <div className="absolute border border-dashed border-track-moment/80" style={{ left: "7.4%", right: "16.6%", top: "8.3%", bottom: "16.6%" }}>
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-2 py-1 type-metadata text-track-moment">Area aman TikTok/Shorts</span>
          </div>
        </div>}
      </div>
    </section>
  );
};

const PreviewFailure: React.FC<{ error: Error; onError: (error: Error) => void }> = ({ error, onError }) => {
  // The initial composition can fail before the parent subscribes to PlayerRef events.
  useEffect(() => { onError(error); }, [error, onError]);
  return <p className="p-4 type-help text-rose-400">Preview tidak dapat diputar. Gunakan tombol Coba Muat Ulang Preview dan periksa media sumber.</p>;
};

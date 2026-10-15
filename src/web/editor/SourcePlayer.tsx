"use client";

import React, { useRef, useEffect, useState, useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faRotateLeft, faFlag, faBackwardStep, faForwardStep } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { FPS, formatTimecode, toFrame, toSeconds } from "@/shared/edit";

type SourcePlayerProps = {
  src: string;
  /** Full asset duration, independent of the trim range. */
  durationFrames: number;
  onSetStart: (frame: number) => void;
  onSetEnd: (frame: number) => void;
  onSetMoment: (frame: number) => void;
  startFrame: number;
  endFrame: number;
  momentFrame: number;
  onMediaError?: (message: string | null) => void;
};

// Changing sources remounts media and discards playback/error state from the old source.
export const SourcePlayer: React.FC<SourcePlayerProps> = (props) => <SourceMedia key={props.src} {...props} />;

const SourceMedia: React.FC<SourcePlayerProps> = ({
  src, durationFrames, onSetStart, onSetEnd, onSetMoment, startFrame, endFrame, momentFrame, onMediaError,
}) => {
  const id = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const live = useRef(true);
  const attempt = useRef(0);
  const errorCallback = useRef(onMediaError);
  useEffect(() => { errorCallback.current = onMediaError; }, [onMediaError]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(src ? null : "Video sumber belum tersedia. Tunggu proxy video atau muat ulang proyek.");
  const [isRetrying, setIsRetrying] = useState(false);
  const lastFrame = Math.max(0, durationFrames - 1);
  const clampFrame = (frame: number) => Math.max(0, Math.min(lastFrame, Math.round(frame)));

  useEffect(() => {
    live.current = true;
    errorCallback.current?.(src ? null : "Video sumber belum tersedia. Tunggu proxy video atau muat ulang proyek.");
    return () => { live.current = false; attempt.current += 1; };
  }, [src]);

  const reportError = (message: string) => {
    setMediaError(message);
    setReady(false);
    setIsPlaying(false);
    setIsRetrying(false);
    errorCallback.current?.(message);
  };
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (!video.paused) { video.pause(); return; }
    const token = ++attempt.current;
    try {
      await video.play();
    } catch (error) {
      if (!live.current || token !== attempt.current) return;
      reportError(`Video tidak dapat diputar: ${error instanceof Error ? error.message : String(error)}. Coba muat ulang video; periksa format media dan proxy sumber.`);
    }
  };
  const seekToFrame = (frame: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(frame)) return;
    const clamped = clampFrame(frame);
    try {
      video.currentTime = toSeconds(clamped);
      setCurrentFrame(clamped);
    } catch (error) {
      reportError(`Posisi video tidak dapat diubah: ${error instanceof Error ? error.message : String(error)}. Coba muat ulang video.`);
    }
  };
  const retry = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    attempt.current += 1;
    setIsRetrying(true);
    try { video.load(); } catch (error) {
      reportError(`Gagal memuat ulang video: ${error instanceof Error ? error.message : String(error)}. Muat ulang proyek atau periksa proxy video.`);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Player Video Sumber (Gameplay)</h2>
        <span className="type-timecode text-muted-foreground">{formatTimecode(currentFrame)} / {formatTimecode(durationFrames)} ({currentFrame} f)</span>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
        <video
          ref={videoRef} src={src || undefined} aria-label="Video sumber gameplay" className="h-full w-full object-contain" playsInline preload="metadata"
          onTimeUpdate={(event) => setCurrentFrame(clampFrame(toFrame(event.currentTarget.currentTime)))}
          onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}
          onLoadedData={() => { setReady(true); setMediaError(null); setIsRetrying(false); errorCallback.current?.(null); }}
          onError={(event) => {
            const code = event.currentTarget.error?.code;
            const reason = code === 2 ? "Jaringan atau berkas sumber tidak tersedia" : code === 3 ? "Video gagal didekode" : code === 4 ? "Format video atau proxy tidak didukung" : "Video sumber gagal dimuat";
            reportError(`${reason}. Coba muat ulang video; pastikan proxy siap atau unggah video yang didukung.`);
          }}
        />
      </div>
      {!ready && !mediaError && <p role="status" className="type-help text-muted-foreground">Memuat video sumber…</p>}
      {mediaError && <div role="alert" className="flex flex-col gap-2 type-help text-rose-400">
        <p>{mediaError}</p>
        <Button type="button" size="sm" variant="outline" onClick={retry} disabled={isRetrying || !src} className="w-fit type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faRotateLeft} /> {isRetrying ? "Memuat ulang…" : "Coba Muat Ulang Video"}
        </Button>
      </div>}
      <label htmlFor={`${id}-seek`} className="sr-only">Posisi video sumber</label>
      <input id={`${id}-seek`} type="range" min={0} max={lastFrame} step={1} value={currentFrame} disabled={!ready} aria-valuetext={`${formatTimecode(currentFrame)}, frame ${currentFrame}`} onChange={(event) => seekToFrame(Number(event.target.value))} className="w-full accent-primary" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void togglePlay()} disabled={!ready} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"}>
            <FontAwesomeIcon aria-hidden="true" icon={isPlaying ? faPause : faPlay} className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => seekToFrame(currentFrame - FPS)} disabled={!ready} aria-label="Mundur 1 detik" className="type-control">-1s</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => seekToFrame(currentFrame + FPS)} disabled={!ready} aria-label="Maju 1 detik" className="type-control">+1s</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onSetStart(currentFrame)} disabled={!ready} className="h-auto min-h-9 whitespace-normal type-control">
            <FontAwesomeIcon aria-hidden="true" icon={faBackwardStep} className="text-track-subtitle" /> Ambil Awal ({formatTimecode(startFrame)})
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onSetMoment(currentFrame)} disabled={!ready} className="h-auto min-h-9 whitespace-normal type-control">
            <FontAwesomeIcon aria-hidden="true" icon={faFlag} className="text-track-moment" /> Tandai Momen ({formatTimecode(momentFrame)})
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onSetEnd(currentFrame)} disabled={!ready} className="h-auto min-h-9 whitespace-normal type-control">
            <FontAwesomeIcon aria-hidden="true" icon={faForwardStep} className="text-track-subtitle" /> Ambil Akhir ({formatTimecode(endFrame)})
          </Button>
        </div>
      </div>
    </section>
  );
};

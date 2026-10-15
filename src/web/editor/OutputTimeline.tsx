"use client";

import React, { useId } from "react";
import type { Edit } from "@/shared/edit";
import { FPS, formatTimecode } from "@/shared/edit";
import { compileEdit, sourceFrameAt } from "@/shared/timeline";

type OutputTimelineProps = {
  edit: Edit;
  currentFrame: number;
  onSeek: (frame: number) => void;
};

export const OutputTimeline: React.FC<OutputTimelineProps> = ({ edit, currentFrame, onSeek }) => {
  const id = useId();
  const compiled = compileEdit(edit);
  const totalFrames = Math.max(1, compiled.durationFrames);
  const lastFrame = totalFrames - 1;
  const clamp = (frame: number) => Math.max(0, Math.min(lastFrame, Math.round(frame)));
  const frame = Number.isFinite(currentFrame) ? clamp(currentFrame) : 0;
  const mappedSourceFrame = compiled.durationFrames > 0 ? sourceFrameAt(compiled, frame) : edit.startFrame;
  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(clamp(Math.floor(ratio * totalFrames)));
  };
  const markers = compiled.segments.flatMap((segment, index) => {
    if (edit.momentFrame < segment.sourceStart || edit.momentFrame >= segment.sourceEnd) return [];
    return [{ index, frame: segment.outputStart + (segment.kind === "freeze" ? 0 : edit.momentFrame - segment.sourceStart) }];
  });
  const rulers = [0, Math.floor(lastFrame / 2), lastFrame];

  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Timeline Hasil 9:16</h2>
        <span className="type-timecode text-primary">Hasil: {formatTimecode(frame)} / {formatTimecode(totalFrames)} ({frame} f)</span>
        <span id={`${id}-mapping`} className="type-timecode text-track-subtitle">Posisi Sumber: {formatTimecode(mappedSourceFrame)} ({mappedSourceFrame} f)</span>
      </div>
      <label htmlFor={`${id}-seek`} className="sr-only">Posisi hasil video</label>
      <input
        id={`${id}-seek`} type="range" min={0} max={lastFrame} step={1} value={frame}
        className="w-full accent-primary" aria-describedby={`${id}-mapping ${id}-help`}
        aria-valuetext={`${formatTimecode(frame)}, frame hasil ${frame}, sumber ${formatTimecode(mappedSourceFrame)}`}
        onChange={(event) => onSeek(clamp(Number(event.target.value)))}
        onKeyDown={(event) => {
          const target = event.key === "Home" ? 0 : event.key === "End" ? lastFrame
            : event.key === "ArrowRight" || event.key === "ArrowUp" ? frame + 1
            : event.key === "ArrowLeft" || event.key === "ArrowDown" ? frame - 1
            : event.key === "PageUp" ? frame + FPS : event.key === "PageDown" ? frame - FPS : null;
          if (target !== null) { event.preventDefault(); onSeek(clamp(target)); }
        }}
      />
      <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 type-metadata">
        <span className="text-track-moment">Momen</span>
        <div className="relative h-6" aria-label="Marker momen">
          {markers.map((marker) => <span key={marker.index} className="absolute top-0 h-5 w-0.5 bg-track-moment" style={{ left: `${marker.frame / totalFrames * 100}%` }} title={`Momen: hasil ${formatTimecode(marker.frame)}, sumber ${formatTimecode(edit.momentFrame)}`}><span className="sr-only">Momen di {formatTimecode(marker.frame)}</span></span>)}
        </div>
        <div className="flex h-full flex-col justify-between gap-2 py-1 text-muted-foreground"><span>Video</span><span>Subtitle</span><span>Efek</span></div>
        <div className="relative flex min-w-0 cursor-pointer flex-col gap-2 overflow-hidden rounded bg-background select-none" onClick={handleTrackClick}>
          <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-primary" style={{ left: `${frame / totalFrames * 100}%` }} />
          <div aria-label="Track Video" className="relative h-6 w-full bg-muted/40">
            {compiled.segments.map((segment, index) => {
              const label = segment.kind === "freeze" ? "Freeze" : segment.kind === "replay" ? "Replay" : "Gameplay";
              const width = segment.durationFrames / totalFrames * 100;
              return <div key={index} className={`absolute inset-y-0 flex items-center justify-center truncate border-r border-background ${segment.kind === "freeze" ? "bg-track-moment text-background" : segment.kind === "replay" ? "bg-primary text-background" : "bg-border"}`} style={{ left: `${segment.outputStart / totalFrames * 100}%`, width: `${width}%` }} title={`${label}: ${formatTimecode(segment.outputStart)}–${formatTimecode(segment.outputStart + segment.durationFrames)}`}>
                {width > 12 ? label : <span className="sr-only">{label}</span>}
              </div>;
            })}
          </div>
          <div aria-label="Track Subtitle" className="relative h-6 w-full bg-muted/40">
            {compiled.captions.map((caption) => <div key={`${caption.id}-${caption.segmentIndex}`} className="absolute inset-y-0 truncate rounded bg-track-subtitle/80 px-1 text-background" style={{ left: `${caption.startFrame / totalFrames * 100}%`, width: `${(caption.endFrame - caption.startFrame) / totalFrames * 100}%` }} title={caption.text}>{caption.text}</div>)}
          </div>
          <div aria-label="Track Efek" className="relative h-6 w-full bg-muted/40">
            {compiled.effects.map((effect) => <div key={`${effect.id}-${effect.segmentIndex}`} className="absolute inset-y-0 truncate rounded bg-track-moment/80 px-1 text-background" style={{ left: `${effect.startFrame / totalFrames * 100}%`, width: `${(effect.endFrame - effect.startFrame) / totalFrames * 100}%` }} title={`${effect.kind}: ${effect.text || effect.strength}`}>{effect.kind}</div>)}
          </div>
        </div>
        <span className="sr-only">Timecode hasil</span>
        <div className="flex justify-between gap-1 type-timecode text-muted-foreground">{rulers.map((value, index) => <span key={index}>{formatTimecode(value)}</span>)}</div>
      </div>
      <p id={`${id}-help`} className="type-help text-muted-foreground">Panah: 1 frame · Page Up/Down: 1 detik · Home/End: awal/akhir hasil. Freeze dan replay memakai pemetaan sumber yang sama dengan renderer.</p>
    </section>
  );
};

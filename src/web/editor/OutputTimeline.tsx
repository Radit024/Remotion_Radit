"use client";

import React from "react";
import type { Edit } from "@/shared/edit";
import { FPS } from "@/shared/edit";
import { compileEdit, sourceFrameAt } from "@/shared/timeline";

type OutputTimelineProps = {
  edit: Edit;
  currentFrame: number;
  onSeek: (frame: number) => void;
};

export const OutputTimeline: React.FC<OutputTimelineProps> = ({
  edit,
  currentFrame,
  onSeek,
}) => {
  const compiled = compileEdit(edit);
  const totalFrames = Math.max(1, compiled.durationFrames);
  const totalSec = (totalFrames / FPS).toFixed(2);
  const currentSec = (currentFrame / FPS).toFixed(2);

  const mappedSourceFrame = (() => {
    try {
      return sourceFrameAt(compiled, Math.min(currentFrame, totalFrames - 1));
    } catch {
      return edit.startFrame;
    }
  })();
  const mappedSourceSec = (mappedSourceFrame / FPS).toFixed(2);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetFrame = Math.round(ratio * totalFrames);
    onSeek(targetFrame);
  };

  const playheadPercent = Math.min(100, Math.max(0, (currentFrame / totalFrames) * 100));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#30383c] bg-[#191e21] p-3 text-xs text-[#EDF1EE]">
      {/* Timeline Header Info */}
      <div className="flex items-center justify-between text-[11px] text-[#A9B4B1]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#EDF1EE]">Timeline Hasil 9:16</span>
          <span className="font-mono text-[#D4F77C]">
            Hasil: {currentSec}s / {totalSec}s ({currentFrame}f)
          </span>
        </div>
        <div className="font-mono text-[#79CDD0]">
          Posisi Sumber: {mappedSourceSec}s ({mappedSourceFrame}f)
        </div>
      </div>

      {/* Visual Tracks Container */}
      <div
        className="relative flex h-28 w-full cursor-pointer flex-col justify-between overflow-hidden rounded border border-[#30383c] bg-[#111416] p-1.5 select-none"
        onClick={handleTimelineClick}
      >
        {/* Playhead */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-[#D4F77C]"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="h-2 w-2 -translate-x-[3px] rounded-full bg-[#D4F77C]" />
        </div>

        {/* Track 1: Segments (Video Gameplay) */}
        <div className="relative h-5 w-full rounded bg-[#191e21]">
          {compiled.segments.map((seg, idx) => {
            const left = (seg.outputStart / totalFrames) * 100;
            const width = (seg.durationFrames / totalFrames) * 100;
            const isFreeze = seg.kind === "freeze";
            const isReplay = seg.kind === "replay";

            return (
              <div
                key={idx}
                className={`absolute top-0 bottom-0 flex items-center justify-center truncate text-[9px] font-medium border-r border-[#111416] ${
                  isFreeze
                    ? "bg-[#FFC879] text-[#111416]"
                    : isReplay
                    ? "bg-[#D4F77C] text-[#111416]"
                    : "bg-[#30383c] text-[#EDF1EE]"
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {width > 8 && (isFreeze ? "Freeze" : isReplay ? "Replay" : "Gameplay")}
              </div>
            );
          })}
        </div>

        {/* Track 2: Subtitle track */}
        <div className="relative h-4 w-full rounded bg-[#191e21]/50">
          {compiled.captions.map((cap) => {
            const left = (cap.startFrame / totalFrames) * 100;
            const width = Math.max(1, ((cap.endFrame - cap.startFrame) / totalFrames) * 100);
            return (
              <div
                key={cap.id}
                className="absolute top-0 bottom-0 truncate rounded bg-[#79CDD0]/80 px-1 text-[9px] font-medium text-[#111416]"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={cap.text}
              >
                {width > 5 && cap.text}
              </div>
            );
          })}
        </div>

        {/* Track 3: Efek track */}
        <div className="relative h-4 w-full rounded bg-[#191e21]/50">
          {compiled.effects.map((eff) => {
            const left = (eff.startFrame / totalFrames) * 100;
            const width = Math.max(1, ((eff.endFrame - eff.startFrame) / totalFrames) * 100);
            return (
              <div
                key={eff.id}
                className="absolute top-0 bottom-0 truncate rounded bg-[#FFC879]/80 px-1 text-[9px] font-medium text-[#111416]"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${eff.kind}: ${eff.text || eff.strength}`}
              >
                {width > 4 && eff.kind}
              </div>
            );
          })}
        </div>

        {/* Time ruler */}
        <div className="flex justify-between text-[9px] text-[#A9B4B1]/60 font-mono">
          <span>00:00.00</span>
          <span>{totalSec}s</span>
        </div>
      </div>
    </div>
  );
};

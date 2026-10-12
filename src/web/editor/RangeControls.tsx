"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { FPS } from "@/shared/edit";

type RangeControlsProps = {
  durationFrames: number;
  startFrame: number;
  endFrame: number;
  momentFrame: number;
  onChangeRange: (start: number, end: number, moment: number) => void;
};

export const RangeControls: React.FC<RangeControlsProps> = ({
  durationFrames,
  startFrame,
  endFrame,
  momentFrame,
  onChangeRange,
}) => {
  const selectedDurationFrames = Math.max(0, endFrame - startFrame);
  const selectedDurationSec = (selectedDurationFrames / FPS).toFixed(1);

  const isValidRange = endFrame > startFrame && momentFrame >= startFrame && momentFrame < endFrame;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#30383c] bg-[#191e21] p-3 text-[#EDF1EE]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Rentang Momen Terpilih</span>
        <span className="text-[#D4F77C] font-mono">
          Durasi: {selectedDurationSec} detik ({selectedDurationFrames} frames)
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#A9B4B1]">Awal (frame)</label>
          <Input
            type="number"
            value={startFrame}
            onChange={(e) => {
              const val = Math.max(0, parseInt(e.target.value) || 0);
              onChangeRange(val, endFrame, momentFrame);
            }}
            className="h-8 border-[#30383c] bg-[#111416] text-xs font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#FFC879]">Titik Lucu (frame)</label>
          <Input
            type="number"
            value={momentFrame}
            onChange={(e) => {
              const val = Math.max(0, parseInt(e.target.value) || 0);
              onChangeRange(startFrame, endFrame, val);
            }}
            className="h-8 border-[#30383c] bg-[#111416] text-xs font-mono text-[#FFC879]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#A9B4B1]">Akhir (frame)</label>
          <Input
            type="number"
            value={endFrame}
            onChange={(e) => {
              const val = Math.max(0, parseInt(e.target.value) || 0);
              onChangeRange(startFrame, val, momentFrame);
            }}
            className="h-8 border-[#30383c] bg-[#111416] text-xs font-mono"
          />
        </div>
      </div>

      {!isValidRange && (
        <div className="text-xs text-rose-400">
          * Titik lucu harus berada di antara awal dan akhir rentang clip.
        </div>
      )}
    </div>
  );
};

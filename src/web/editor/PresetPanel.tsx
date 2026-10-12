"use client";

import React from "react";
import type { Preset, Edit } from "@/shared/edit";
import { makePresetEffects } from "@/shared/presets";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

type PresetPanelProps = {
  edit: Edit;
  onChange: (updated: Partial<Edit>) => void;
};

export const PresetPanel: React.FC<PresetPanelProps> = ({ edit, onChange }) => {
  const setPreset = (preset: Preset) => {
    const defaultEffects = makePresetEffects(preset, edit.momentFrame, edit.startFrame, edit.endFrame);
    onChange({
      preset,
      effects: defaultEffects,
      freezeFrames: preset === "meme" ? 12 : 0,
      replayFrames: 0,
    });
  };

  const toNum = (val: number | readonly number[]) => (typeof val === "number" ? val : val[0] ?? 0);

  return (
    <div className="flex flex-col gap-4 text-xs text-[#EDF1EE]">
      {/* Preset Buttons */}
      <div className="flex flex-col gap-1.5">
        <label className="font-semibold text-[#A9B4B1]">Preset Video</label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPreset("light")}
            className={`h-9 border-[#30383c] ${
              edit.preset === "light"
                ? "bg-[#D4F77C] text-[#111416] font-semibold hover:bg-[#D4F77C]/90"
                : "bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            }`}
          >
            Light (Halus)
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPreset("meme")}
            className={`h-9 border-[#30383c] ${
              edit.preset === "meme"
                ? "bg-[#D4F77C] text-[#111416] font-semibold hover:bg-[#D4F77C]/90"
                : "bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            }`}
          >
            Meme (Lucu/Ekspresif)
          </Button>
        </div>
      </div>

      {/* Layout Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="font-semibold text-[#A9B4B1]">Tata Letak Kanvas 9:16</label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ layout: "contain" })}
            className={`border-[#30383c] ${
              edit.layout === "contain"
                ? "bg-[#30383c] text-[#EDF1EE]"
                : "bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            }`}
          >
            Contain + Blur
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ layout: "crop" })}
            className={`border-[#30383c] ${
              edit.layout === "crop"
                ? "bg-[#30383c] text-[#EDF1EE]"
                : "bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            }`}
          >
            Crop Penuh
          </Button>
        </div>
      </div>

      {/* Focus Controls */}
      <div className="flex flex-col gap-2 rounded border border-[#30383c] bg-[#111416] p-2.5">
        <div className="flex justify-between text-[11px] text-[#A9B4B1]">
          <span>Fokus Horizontal (X)</span>
          <span className="font-mono">{Math.round(edit.focusX * 100)}%</span>
        </div>
        <Slider
          value={[edit.focusX]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(val) => onChange({ focusX: toNum(val) })}
        />

        <div className="flex justify-between text-[11px] text-[#A9B4B1] mt-1">
          <span>Fokus Vertikal (Y)</span>
          <span className="font-mono">{Math.round(edit.focusY * 100)}%</span>
        </div>
        <Slider
          value={[edit.focusY]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(val) => onChange({ focusY: toNum(val) })}
        />
      </div>

      {/* Freeze & Replay Effects */}
      <div className="flex flex-col gap-3 rounded border border-[#30383c] bg-[#111416] p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium">Freeze Frame di Titik Lucu</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#FFC879]">{edit.freezeFrames} f</span>
            <Switch
              checked={edit.freezeFrames > 0}
              onCheckedChange={(checked) => onChange({ freezeFrames: checked ? 12 : 0 })}
            />
          </div>
        </div>

        {edit.freezeFrames > 0 && (
          <Slider
            value={[edit.freezeFrames]}
            min={1}
            max={60}
            step={1}
            onValueChange={(val) => onChange({ freezeFrames: toNum(val) })}
          />
        )}

        <div className="flex items-center justify-between pt-1 border-t border-[#30383c]">
          <span className="text-[11px] font-medium">Instant Replay Momen</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#D4F77C]">{edit.replayFrames} f</span>
            <Switch
              checked={edit.replayFrames > 0}
              onCheckedChange={(checked) => onChange({ replayFrames: checked ? 36 : 0 })}
            />
          </div>
        </div>

        {edit.replayFrames > 0 && (
          <Slider
            value={[edit.replayFrames]}
            min={15}
            max={90}
            step={1}
            onValueChange={(val) => onChange({ replayFrames: toNum(val) })}
          />
        )}
      </div>

      {/* Caption Position */}
      <div className="flex flex-col gap-2 rounded border border-[#30383c] bg-[#111416] p-2.5">
        <div className="flex justify-between text-[11px] text-[#A9B4B1]">
          <span>Posisi Vertikal Subtitle</span>
          <span className="font-mono">{Math.round(edit.captionY * 100)}%</span>
        </div>
        <Slider
          value={[edit.captionY]}
          min={0.15}
          max={0.82}
          step={0.01}
          onValueChange={(val) => onChange({ captionY: toNum(val) })}
        />
      </div>
    </div>
  );
};

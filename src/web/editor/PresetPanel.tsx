"use client";

import React, { useId, useState } from "react";
import type { Preset, Edit } from "@/shared/edit";
import { LIMITS } from "@/shared/edit";
import { applyPresetDefaults, PRESET_DEFAULTS } from "@/shared/presets";
import { Switch } from "@/components/ui/switch";

type PresetPanelProps = {
  edit: Edit;
  onChange: (updated: Partial<Edit>) => void;
};

export const PresetPanel: React.FC<PresetPanelProps> = ({ edit, onChange }) => {
  const id = useId();
  const [presetError, setPresetError] = useState<string | null>(null);
  const setPreset = (preset: Preset) => {
    try {
      const updated = applyPresetDefaults(edit, preset);
      setPresetError(null);
      onChange({ preset, effects: updated.effects, freezeFrames: updated.freezeFrames, replayFrames: updated.replayFrames });
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : String(error));
    }
  };
  const sliders = [
    { key: "focusX", label: "Fokus Horizontal (X)", min: 0, max: 1, step: 0.01 },
    { key: "focusY", label: "Fokus Vertikal (Y)", min: 0, max: 1, step: 0.01 },
    { key: "captionY", label: "Posisi Vertikal Subtitle", min: LIMITS.captionYMin, max: LIMITS.captionYMax, step: 0.01 },
  ] as const;

  return (
    <section aria-label="Pengaturan preset" className="editor-panel flex min-w-0 flex-col gap-4 type-control text-foreground">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="type-panel-title mb-2">Preset Video</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([{ value: "light", label: "Light (Halus)" }, { value: "meme", label: "Meme (Lucu/Ekspresif)" }] as const).map(({ value, label }) => (
            <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 ${edit.preset === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
              <input type="radio" name={`${id}-preset`} value={value} checked={edit.preset === value} onChange={() => setPreset(value)} aria-describedby={`${id}-preset-help${presetError ? ` ${id}-preset-error` : ""}`} />
              {label}
            </label>
          ))}
        </div>
        <p id={`${id}-preset-help`} className="type-help text-muted-foreground">
          {PRESET_DEFAULTS[edit.preset].description} Mengganti preset hanya mengganti zoom/shake bawaan; stiker, SFX, reaksi dan efek custom tetap ada. Light mematikan freeze/replay. Meme memakai freeze 12 frame dan mempertahankan replay yang sudah aktif.
        </p>
      </fieldset>
      {presetError && <p id={`${id}-preset-error`} role="alert" className="type-help text-rose-400">{presetError}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="type-panel-title mb-2">Tata Letak Kanvas 9:16</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([{ value: "contain", label: "Contain + Blur" }, { value: "crop", label: "Crop Penuh" }] as const).map(({ value, label }) => (
            <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 ${edit.layout === value ? "bg-muted text-foreground" : "bg-background text-muted-foreground"}`}>
              <input type="radio" name={`${id}-layout`} value={value} checked={edit.layout === value} onChange={() => onChange({ layout: value })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-4 rounded border border-border bg-background p-3">
        {sliders.map(({ key, label, min, max, step }) => (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${id}-${key}`}>{label}</label>
              <span className="type-timecode text-muted-foreground">{Math.round(edit[key] * 100)}%</span>
            </div>
            <input id={`${id}-${key}`} type="range" className="w-full accent-primary" value={edit[key]} min={min} max={max} step={step} aria-valuetext={`${Math.round(edit[key] * 100)} persen`} onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${id}-freeze`}>Freeze Frame di Titik Lucu</label>
          <Switch id={`${id}-freeze`} checked={edit.freezeFrames > 0} onCheckedChange={(checked) => onChange({ freezeFrames: checked ? 12 : 0 })} />
        </div>
        {edit.freezeFrames > 0 && <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-freeze-length`} className="type-help">Durasi freeze <span className="type-timecode text-track-moment">{edit.freezeFrames} f</span></label>
          <input id={`${id}-freeze-length`} type="range" className="w-full accent-primary" value={edit.freezeFrames} min={1} max={LIMITS.freezeMax} step={1} aria-valuetext={`${edit.freezeFrames} frame`} onChange={(event) => onChange({ freezeFrames: Number(event.target.value) })} />
        </div>}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <label htmlFor={`${id}-replay`}>Instant Replay Momen</label>
          <Switch id={`${id}-replay`} checked={edit.replayFrames > 0} onCheckedChange={(checked) => onChange({ replayFrames: checked ? 36 : 0 })} />
        </div>
        {edit.replayFrames > 0 && <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-replay-length`} className="type-help">Durasi replay <span className="type-timecode text-primary">{edit.replayFrames} f</span></label>
          <input id={`${id}-replay-length`} type="range" className="w-full accent-primary" value={edit.replayFrames} min={1} max={LIMITS.replayMax} step={1} aria-valuetext={`${edit.replayFrames} frame`} onChange={(event) => onChange({ replayFrames: Number(event.target.value) })} />
        </div>}
        <p className="type-help text-muted-foreground">Freeze menahan gambar pada titik lucu; replay mengulang cuplikan di sekitarnya. Keduanya menambah durasi hasil tanpa mengubah rentang sumber.</p>
      </div>
    </section>
  );
};

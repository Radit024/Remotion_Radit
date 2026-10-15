"use client";

import React, { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatTimecode, parseTimecode, toSeconds } from "@/shared/edit";

type RangeControlsProps = {
  /** Full source duration, not the selected end frame. */
  durationFrames: number;
  startFrame: number;
  endFrame: number;
  momentFrame: number;
  onChangeRange: (start: number, end: number, moment: number) => void;
  onValidityChange?: (valid: boolean) => void;
};

type Field = "start" | "moment" | "end";
const fields: { key: Field; label: string }[] = [
  { key: "start", label: "Awal" },
  { key: "moment", label: "Titik Lucu" },
  { key: "end", label: "Akhir" },
];

export const RangeControls: React.FC<RangeControlsProps> = ({
  durationFrames, startFrame, endFrame, momentFrame, onChangeRange, onValidityChange,
}) => {
  const id = useId();
  const [mode, setMode] = useState<"timecode" | "frame">("timecode");
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});
  const committed = { start: startFrame, moment: momentFrame, end: endFrame };
  const values = { ...committed };
  let error: string | null = null;

  for (const { key, label } of fields) {
    const draft = drafts[key];
    if (draft !== undefined) {
      values[key] = mode === "timecode"
        ? parseTimecode(draft)
        : /^\d+$/.test(draft.trim()) ? Number(draft) : NaN;
    }
    if (!Number.isSafeInteger(values[key])) {
      error ??= mode === "timecode"
        ? `${label}: gunakan mm:ss.dd (detik 00–59), misalnya 01:38.40.`
        : `${label}: masukkan frame bilangan bulat, bukan pecahan atau teks kosong.`;
    }
  }
  if (!error && (!Number.isSafeInteger(durationFrames) || durationFrames <= 0)) {
    error = "Durasi sumber belum tersedia.";
  }
  if (!error && (values.start < 0 || values.end > durationFrames || values.end <= 0)) {
    error = `Rentang harus berada dalam durasi penuh sumber: 0–${durationFrames} frame (${formatTimecode(durationFrames)}).`;
  }
  if (!error && values.start >= values.end) error = "Awal harus lebih kecil dari akhir rentang.";
  if (!error && (values.moment < values.start || values.moment >= values.end)) {
    error = "Titik lucu harus berada di antara awal dan akhir rentang; tidak boleh sama dengan akhir.";
  }
  const valid = error === null;
  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);

  const commit = () => {
    if (!valid) return;
    if (values.start !== startFrame || values.end !== endFrame || values.moment !== momentFrame) {
      onChangeRange(values.start, values.end, values.moment);
    }
    setDrafts({});
  };
  const restore = () => setDrafts({});
  const changeMode = (next: "timecode" | "frame") => {
    if (!valid) return;
    commit();
    setMode(next);
  };
  const selectedDurationFrames = Math.max(0, endFrame - startFrame);

  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Rentang Momen Terpilih</h2>
        <span className="type-timecode text-primary">
          Durasi: {toSeconds(selectedDurationFrames).toFixed(1)} detik ({selectedDurationFrames} frames)
        </span>
      </div>
      <fieldset className="flex flex-wrap gap-3 type-control">
        <legend className="sr-only">Mode input rentang</legend>
        <label className="inline-flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={mode === "timecode"} onChange={() => changeMode("timecode")} />
          Timecode
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={mode === "frame"} onChange={() => changeMode("frame")} />
          Presisi frame
        </label>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-${key}`} className={`type-control ${key === "moment" ? "text-track-moment" : "text-muted-foreground"}`}>
              {label} ({mode === "frame" ? "frame" : "timecode"})
            </label>
            <Input
              id={`${id}-${key}`}
              type="text"
              inputMode={mode === "frame" ? "numeric" : "decimal"}
              value={drafts[key] ?? (mode === "frame" ? String(committed[key]) : formatTimecode(committed[key]))}
              onChange={(event) => setDrafts((previous) => ({ ...previous, [key]: event.target.value }))}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); commit(); }
                if (event.key === "Escape") { event.preventDefault(); restore(); }
              }}
              aria-invalid={!valid}
              aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
              className="h-9 min-w-0 border-border bg-background font-mono text-sm"
            />
          </div>
        ))}
      </div>
      <p id={`${id}-help`} className="type-help text-muted-foreground">
        Sumber penuh {formatTimecode(durationFrames)} · Enter atau keluar kolom untuk menerapkan. Escape membatalkan input. Akhir rentang tidak termasuk dalam clip.
      </p>
      {error && <p id={`${id}-error`} role="alert" className="type-help text-rose-400">{error} Draft valid terakhir tetap digunakan; perbaiki input sebelum render.</p>}
    </section>
  );
};

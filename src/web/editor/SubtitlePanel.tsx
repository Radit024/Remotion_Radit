"use client";

import React, { useState } from "react";
import { Plus, Trash2, Upload, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Caption } from "@/shared/edit";
import { FPS, toFrame } from "@/shared/edit";

type SubtitlePanelProps = {
  captions: Caption[];
  onChangeCaptions: (captions: Caption[]) => void;
  onTriggerAiTranscribe: () => void;
  isTranscribing: boolean;
  startFrame: number;
  endFrame: number;
};

export const SubtitlePanel: React.FC<SubtitlePanelProps> = ({
  captions,
  onChangeCaptions,
  onTriggerAiTranscribe,
  isTranscribing,
  startFrame,
  endFrame,
}) => {
  const [newText, setNewText] = useState("");
  const [newSpeaker, setNewSpeaker] = useState("");

  const formatSec = (frame: number) => (frame / FPS).toFixed(2);

  const addCaption = () => {
    if (!newText.trim()) return;
    const item: Caption = {
      id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startFrame,
      endFrame: Math.min(endFrame, startFrame + 90), // default 3 detik
      text: newText.trim(),
      speaker: newSpeaker.trim() || null,
    };
    onChangeCaptions([...captions, item]);
    setNewText("");
    setNewSpeaker("");
  };

  const removeCaption = (id: string) => {
    onChangeCaptions(captions.filter((c) => c.id !== id));
  };

  const updateCaption = (id: string, partial: Partial<Caption>) => {
    onChangeCaptions(
      captions.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    );
  };

  const handleImportSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const parsed = parseSrtText(text, startFrame);
      if (parsed.length > 0) {
        onChangeCaptions([...captions, ...parsed]);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportSrt = () => {
    const srt = exportSrtText(captions);
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subtitles.srt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 text-xs text-[#EDF1EE]">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#A9B4B1]">Daftar Subtitle ({captions.length})</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onTriggerAiTranscribe}
            disabled={isTranscribing}
            className="border-[#D4F77C]/40 bg-[#111416] text-xs text-[#D4F77C] hover:bg-[#D4F77C]/10"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {isTranscribing ? "Mentranskripsi..." : "AI STT"}
          </Button>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[#30383c] bg-[#111416] p-2 text-[#A9B4B1] hover:bg-[#30383c]">
            <input
              type="file"
              accept=".srt"
              className="hidden"
              onChange={handleImportSrt}
            />
            <Upload className="h-3.5 w-3.5" />
          </label>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportSrt}
            disabled={captions.length === 0}
            className="border-[#30383c] bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Add New Caption Form */}
      <div className="flex flex-col gap-2 rounded border border-[#30383c] bg-[#111416] p-2.5">
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Pembicara (opsional)"
            value={newSpeaker}
            onChange={(e) => setNewSpeaker(e.target.value)}
            className="h-8 border-[#30383c] bg-[#191e21] text-xs"
          />
          <Input
            placeholder="Teks subtitle..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCaption();
            }}
            className="col-span-2 h-8 border-[#30383c] bg-[#191e21] text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={addCaption}
          disabled={!newText.trim()}
          className="h-7 bg-[#30383c] text-xs text-[#EDF1EE] hover:bg-[#404a50]"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Tambah Cue Subtitle
        </Button>
      </div>

      {/* List of Captions */}
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
        {captions.length === 0 ? (
          <div className="rounded border border-dashed border-[#30383c] p-4 text-center text-[#A9B4B1]">
            Belum ada subtitle. Tulis manual, unggah berkas .srt, atau jalankan Transkripsi AI.
          </div>
        ) : (
          captions.map((cap) => (
            <div
              key={cap.id}
              className="flex flex-col gap-1.5 rounded border border-[#30383c] bg-[#111416] p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-1 text-[11px] text-[#A9B4B1]">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[#79CDD0]">
                    {formatSec(cap.startFrame)}s - {formatSec(cap.endFrame)}s
                  </span>
                  {cap.speaker && (
                    <span className="rounded bg-[#30383c] px-1 text-[10px] text-[#EDF1EE]">
                      {cap.speaker}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCaption(cap.id)}
                  className="h-6 w-6 p-0 text-[#A9B4B1] hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <Input
                value={cap.text}
                onChange={(e) => updateCaption(cap.id, { text: e.target.value })}
                className="h-7 border-[#30383c] bg-[#191e21] text-xs"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Helper SRT parser
function parseSrtText(srt: string, offsetFrame = 0): Caption[] {
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/);
  const result: Caption[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const timeLineIndex = lines[0].includes("-->") ? 0 : 1;
    const timeLine = lines[timeLineIndex];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const startSec = parseSrtTimestamp(startRaw);
    const endSec = parseSrtTimestamp(endRaw);
    if (startSec === null || endSec === null) continue;

    const textLines = lines.slice(timeLineIndex + 1).join(" ").trim();
    if (!textLines) continue;

    result.push({
      id: `srt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startFrame: offsetFrame + toFrame(startSec),
      endFrame: offsetFrame + toFrame(endSec),
      text: textLines.slice(0, 160),
      speaker: null,
    });
  }
  return result;
}

function parseSrtTimestamp(str: string): number | null {
  const match = /^(\d+):(\d+):(\d+)[,\.](\d+)$/.exec(str);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const ms = Number(match[4].padEnd(3, "0").slice(0, 3));
  return h * 3600 + m * 60 + s + ms / 1000;
}

function exportSrtText(captions: Caption[]): string {
  return captions
    .map((c, i) => {
      const start = formatSrtTime(c.startFrame / FPS);
      const end = formatSrtTime(c.endFrame / FPS);
      const speakerPrefix = c.speaker ? `${c.speaker}: ` : "";
      return `${i + 1}\n${start} --> ${end}\n${speakerPrefix}${c.text}\n`;
    })
    .join("\n");
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

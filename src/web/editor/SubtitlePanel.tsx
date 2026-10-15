"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrashCan, faUpload, faDownload, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Caption } from "@/shared/edit";
import { FPS, LIMITS, formatTimecode, parseTimecode, toSeconds } from "@/shared/edit";

type SubtitlePanelProps = {
  captions: Caption[];
  onChangeCaptions: (captions: Caption[]) => void;
  onTriggerAiTranscribe: () => void;
  isTranscribing: boolean;
  startFrame: number;
  endFrame: number;
  /** True only when the parent has confirmed that AI configuration is ready. */
  aiEnabled?: boolean;
  aiStatusLabel?: string;
  /** Use the project/draft identity when this panel stays mounted across projects. */
  importScopeKey?: string;
};

export const SubtitlePanel: React.FC<SubtitlePanelProps> = ({
  captions, onChangeCaptions, onTriggerAiTranscribe, isTranscribing, startFrame, endFrame, aiEnabled = false, aiStatusLabel, importScopeKey,
}) => {
  const id = useId();
  const importRef = useRef<HTMLInputElement>(null);
  const importing = useRef(false);
  const readerRef = useRef<FileReader | null>(null);
  const live = useRef(true);
  const importLifetime = useRef(0);
  const latest = useRef({ captions, startFrame, endFrame, onChangeCaptions, importScopeKey });
  useLayoutEffect(() => {
    const previous = latest.current;
    if (previous.startFrame !== startFrame || previous.endFrame !== endFrame || previous.importScopeKey !== importScopeKey) {
      importLifetime.current += 1;
    }
    latest.current = { captions, startFrame, endFrame, onChangeCaptions, importScopeKey };
  }, [captions, startFrame, endFrame, onChangeCaptions, importScopeKey]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      importLifetime.current += 1;
      readerRef.current?.abort();
    };
  }, []);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newSpeaker, setNewSpeaker] = useState("");
  const aiReady = aiEnabled === true;
  const canAdd = !isImporting && newText.trim().length > 0 && endFrame > startFrame && captions.length < LIMITS.captionsMax;
  const addCaption = () => {
    if (!canAdd || importing.current) return;
    onChangeCaptions([...captions, {
      id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startFrame, endFrame: Math.min(endFrame, startFrame + FPS * 3),
      text: newText.trim(), speaker: newSpeaker.trim() || null,
    }]);
    setNewText("");
    setNewSpeaker("");
  };
  const handleImportSrt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || importing.current) return;
    importing.current = true;
    const context = latest.current;
    const lifetime = importLifetime.current;
    setIsImporting(true);
    setImportError(null);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        readerRef.current = reader;
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Berkas SRT tidak dapat dibaca."));
        reader.onabort = () => reject(new Error("Pembacaan SRT dibatalkan."));
        reader.readAsText(file);
      });
      if (!live.current) return;
      if (lifetime !== importLifetime.current) {
        throw new Error("Rentang atau proyek berubah selama pembacaan. Impor ulang SRT untuk rentang/proyek saat ini; subtitle yang ada tidak diubah.");
      }
      const current = latest.current;
      const parsed = parseSrtText(text, context.startFrame)
        .map((caption) => ({ ...caption, endFrame: Math.min(context.endFrame, caption.endFrame) }))
        .filter((caption) => caption.startFrame < caption.endFrame);
      if (!parsed.length) throw new Error("Tidak ada cue SRT valid dalam rentang terpilih. Periksa timestamp dan isi berkas.");
      if (current.captions.length + parsed.length > LIMITS.captionsMax) throw new Error(`Maksimum ${LIMITS.captionsMax} cue subtitle per proyek.`);
      current.onChangeCaptions([...current.captions, ...parsed]);
    } catch (error) {
      if (live.current) setImportError(`Gagal mengimpor SRT: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      importing.current = false;
      readerRef.current = null;
      if (live.current) setIsImporting(false);
      input.value = "";
    }
  };
  const handleExportSrt = () => {
    const blob = new Blob([exportSrtText(captions)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "subtitles.srt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={isImporting} className="editor-panel flex min-w-0 flex-col gap-3 type-control text-foreground">
      <h2 id={`${id}-title`} className="type-panel-title">Daftar Subtitle ({captions.length})</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onTriggerAiTranscribe} disabled={!aiReady || isTranscribing || isImporting} aria-describedby={`${id}-ai-status`} className="type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faWandMagicSparkles} /> {isTranscribing ? "Mentranskripsi…" : "AI STT"}
        </Button>
        <input ref={importRef} type="file" accept=".srt" aria-label="Berkas SRT" className="hidden" onChange={(event) => void handleImportSrt(event)} disabled={isImporting} />
        <Button type="button" size="sm" variant="outline" onClick={() => importRef.current?.click()} disabled={isImporting} className="type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faUpload} /> {isImporting ? "Mengimpor SRT…" : "Impor SRT"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleExportSrt} disabled={captions.length === 0} className="type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faDownload} /> Ekspor SRT
        </Button>
      </div>
      <p id={`${id}-ai-status`} className="type-help text-muted-foreground">{aiStatusLabel ?? (aiReady ? "AI siap. Transkripsi menggunakan audio rentang terpilih." : "AI belum tersedia. Gunakan input manual atau Impor SRT.")}</p>
      <p className="type-help text-muted-foreground">Timestamp SRT impor dimulai dari awal rentang terpilih; ekspor memakai waktu sumber.</p>
      {isImporting && <p role="status" className="type-help text-muted-foreground">Impor SRT sedang dibaca. Pengeditan subtitle dan AI dikunci sampai selesai; perubahan rentang atau proyek akan membatalkan penerapan impor.</p>}
      {importError && <p role="alert" className="type-help text-rose-400">{importError}</p>}
      <div className="flex flex-col gap-2 rounded border border-border bg-background p-3">
        <label htmlFor={`${id}-speaker`} className="type-control text-muted-foreground">Pembicara (opsional)</label>
        <Input id={`${id}-speaker`} disabled={isImporting} value={newSpeaker} maxLength={LIMITS.speakerMax} onChange={(event) => setNewSpeaker(event.target.value)} className="h-9 border-border bg-card text-sm" />
        <label htmlFor={`${id}-text`} className="type-control text-muted-foreground">Teks subtitle baru</label>
        <Input id={`${id}-text`} disabled={isImporting} value={newText} maxLength={LIMITS.captionMax} onChange={(event) => setNewText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCaption(); } }} className="h-9 border-border bg-card text-sm" />
        <Button type="button" size="sm" onClick={addCaption} disabled={!canAdd} className="h-auto min-h-9 whitespace-normal type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faPlus} /> Tambah Cue Subtitle
        </Button>
      </div>
      <div className="panel-scroll flex max-h-80 flex-col gap-3 pr-1">
        {captions.length === 0 ? <p className="rounded border border-dashed border-border p-4 type-help text-muted-foreground">Belum ada subtitle. Tulis manual atau impor berkas .srt.</p> : captions.map((caption, index) => (
          <div key={caption.id} className="flex min-w-0 flex-col gap-2 rounded border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-timecode text-track-subtitle">{formatTimecode(caption.startFrame)}–{formatTimecode(caption.endFrame)}</span>
              {caption.speaker && <span className="rounded bg-muted px-1 type-metadata">{caption.speaker}</span>}
              <Button type="button" size="sm" variant="ghost" disabled={isImporting} onClick={() => { if (!importing.current) onChangeCaptions(captions.filter((item) => item.id !== caption.id)); }} aria-label={`Hapus subtitle ${index + 1}`} title={`Hapus subtitle ${index + 1}`} className="text-muted-foreground hover:text-rose-400">
                <FontAwesomeIcon aria-hidden="true" icon={faTrashCan} />
              </Button>
            </div>
            <label htmlFor={`${id}-cue-${caption.id}`} className="sr-only">Teks subtitle {index + 1}</label>
            <Input id={`${id}-cue-${caption.id}`} disabled={isImporting} value={caption.text} maxLength={LIMITS.captionMax} onChange={(event) => { if (!importing.current) onChangeCaptions(captions.map((item) => item.id === caption.id ? { ...item, text: event.target.value } : item)); }} className="h-9 border-border bg-card text-sm" />
          </div>
        ))}
      </div>
    </section>
  );
};

export function parseSrtText(srt: string, offsetFrame = 0): Caption[] {
  const result: Caption[] = [];
  for (const block of srt.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const timeLineIndex = lines[0]?.includes("-->") ? 0 : 1;
    const parts = lines[timeLineIndex]?.split("-->").map((value) => value.trim());
    if (!parts || parts.length !== 2) continue;
    const parseTimestamp = (value: string) => {
      const match = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/.exec(value);
      return match ? parseTimecode(`${Number(match[1]) * 60 + Number(match[2])}:${match[3]}.${match[4]}`) : NaN;
    };
    const start = parseTimestamp(parts[0]);
    const end = parseTimestamp(parts[1]);
    const text = lines.slice(timeLineIndex + 1).join(" ").trim();
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || !text) continue;
    result.push({ id: `srt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startFrame: offsetFrame + start, endFrame: offsetFrame + end, text: text.slice(0, LIMITS.captionMax), speaker: null });
  }
  return result;
}

export function exportSrtText(captions: Caption[]): string {
  const formatSrtTime = (frame: number) => {
    const milliseconds = Math.round(toSeconds(frame) * 1000);
    const seconds = Math.floor(milliseconds / 1000);
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
  };
  return captions.map((caption, index) => `${index + 1}\n${formatSrtTime(caption.startFrame)} --> ${formatSrtTime(caption.endFrame)}\n${caption.speaker ? `${caption.speaker}: ` : ""}${caption.text}\n`).join("\n");
}

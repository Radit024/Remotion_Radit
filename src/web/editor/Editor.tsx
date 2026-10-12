"use client";

import React, { useState, useEffect } from "react";
import {
  Film,
  Save,
  Play,
  Upload,
  Plus,
  Sparkles,
  Layers,
  Subtitles,
  Smile,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Suggestion } from "@/shared/suggestions";
import type { Edit } from "@/shared/edit";
import {
  fetchProjects,
  createProject,
  uploadAsset,
  triggerRender,
  triggerTranscribe,
  triggerSuggestions,
  fetchHealth,
  type ProjectSummary,
  type HealthInfo,
} from "@/web/api";
import { useProject } from "./useProject";
import { SourcePlayer } from "./SourcePlayer";
import { OutputPreview } from "./OutputPreview";
import { RangeControls } from "./RangeControls";
import { PresetPanel } from "./PresetPanel";
import { SubtitlePanel } from "./SubtitlePanel";
import { AssetPanel } from "./AssetPanel";
import { SuggestionPanel } from "./SuggestionPanel";
import { OutputTimeline } from "./OutputTimeline";
import { RenderDialog } from "./RenderDialog";

export const Editor: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [activeCenterTab, setActiveCenterTab] = useState<"output" | "source">("output");
  const [activeToolTab, setActiveToolTab] = useState("preset");
  const [currentOutputFrame, setCurrentOutputFrame] = useState(0);

  // AI & Render states
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [isRenderDialogOpen, setIsRenderDialogOpen] = useState(false);

  // Uploading state
  const [isUploadingSource, setIsUploadingSource] = useState(false);

  const {
    project,
    draft,
    isDirty,
    isSaving,
    error: projectError,
    updateDraft,
    save,
    reload,
  } = useProject(selectedProjectId);

  useEffect(() => {
    void fetchProjects().then((list) => {
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    });
    void fetchHealth().then(setHealth).catch(() => {});
  }, []);

  const handleUploadNewVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingSource(true);
      const asset = await uploadAsset(file);
      const newProj = await createProject(asset.id, file.name.replace(/\.[^/.]+$/, ""));
      setProjects((prev) => [
        {
          id: newProj.id,
          name: newProj.name,
          updatedAt: newProj.updatedAt,
          sourceName: asset.name,
        },
        ...prev,
      ]);
      setSelectedProjectId(newProj.id);
      setActiveCenterTab("source");
    } catch (err) {
      alert(`Gagal mengunggah video: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploadingSource(false);
      e.target.value = "";
    }
  };

  const handleTriggerRender = async () => {
    if (!draft || !project) return;
    const saved = await save();
    if (!saved) return;
    try {
      const job = await triggerRender(saved.id, saved.revision);
      setRenderJobId(job.id);
      setIsRenderDialogOpen(true);
    } catch (err) {
      alert(`Gagal memulai render: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleTriggerTranscribe = async () => {
    if (!draft || !project) return;
    const saved = await save();
    if (!saved) return;
    try {
      setIsTranscribing(true);
      await triggerTranscribe(saved.id, saved.revision);
      alert("Permintaan transkripsi AI dikirim ke antrean worker!");
    } catch (err) {
      alert(`Transkripsi gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTriggerSuggestions = async () => {
    if (!draft || !project) return;
    const saved = await save();
    if (!saved) return;
    try {
      setIsSuggesting(true);
      await triggerSuggestions(saved.id, saved.revision);
      alert("Permintaan rekomendasi efek AI dikirim ke antrean worker!");
    } catch (err) {
      alert(`Saran AI gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleApplySuggestion = (sug: Suggestion) => {
    if (!draft) return;
    updateDraft((prev) => ({
      ...prev,
      effects: [
        ...prev.effects,
        {
          id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: sug.kind,
          startFrame: sug.startFrame,
          endFrame: sug.endFrame,
          text: sug.text,
          assetId: null,
          strength: sug.strength,
        },
      ],
    }));
    setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
  };

  const handleDismissSuggestion = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  const sourceUrl = project?.assetId ? `/api/assets/${project.assetId}/content` : "";

  return (
    <div className="flex h-screen w-full flex-col bg-[#111416] text-[#EDF1EE]">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#30383c] bg-[#191e21] px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-[#D4F77C]" />
            <span className="font-bold tracking-tight text-[#EDF1EE]">Moment Lab</span>
          </div>

          {/* Project selector */}
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-8 rounded border border-[#30383c] bg-[#111416] px-2 text-xs text-[#EDF1EE] focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[#30383c] bg-[#111416] px-2.5 py-1 text-xs text-[#EDF1EE] hover:bg-[#30383c]">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUploadNewVideo}
              disabled={isUploadingSource}
            />
            <Plus className="mr-1 h-3.5 w-3.5" />
            {isUploadingSource ? "Mengunggah..." : "Video Baru"}
          </label>
        </div>

        {/* Center / Right Header Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            {isDirty ? (
              <span className="flex items-center gap-1 text-[#FFC879]">
                <AlertCircle className="h-3.5 w-3.5" /> Belum Tersimpan
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Tersimpan (Rev {project?.revision ?? 1})
              </span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void save()}
            disabled={!isDirty || isSaving}
            className="h-8 border-[#30383c] bg-[#111416] text-xs text-[#EDF1EE] hover:bg-[#30383c]"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? "Menyimpan..." : "Simpan"}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleTriggerRender}
            disabled={!draft}
            className="h-8 bg-[#D4F77C] text-xs font-semibold text-[#111416] hover:bg-[#D4F77C]/90"
          >
            <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
            Render 9:16
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      {!draft ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Film className="h-12 w-12 text-[#A9B4B1]" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[#EDF1EE]">Belum Ada Proyek yang Dipilih</h2>
            <p className="max-w-md text-xs text-[#A9B4B1]">
              Pilih proyek di atas atau unggah video gameplay berdurasi 3–5 menit untuk memulai mengedit momen lucu.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-[#D4F77C] px-4 py-2 text-xs font-semibold text-[#111416] hover:bg-[#D4F77C]/90">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUploadNewVideo}
              disabled={isUploadingSource}
            />
            <Upload className="mr-2 h-4 w-4" />
            Unggah Video Gameplay
          </label>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Middle Workspace: 3 Columns (Tools | Preview | AI Suggestions) */}
          <div className="grid flex-1 grid-cols-12 overflow-hidden">
            {/* Left Column: Tools (Presets, Subtitles, Assets) */}
            <div className="col-span-3 flex flex-col border-r border-[#30383c] bg-[#191e21] p-3 overflow-y-auto">
              <Tabs value={activeToolTab} onValueChange={setActiveToolTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-[#111416] p-0.5">
                  <TabsTrigger value="preset" className="text-xs">
                    <Layers className="mr-1 h-3.5 w-3.5" /> Preset
                  </TabsTrigger>
                  <TabsTrigger value="subtitle" className="text-xs">
                    <Subtitles className="mr-1 h-3.5 w-3.5" /> Subtitle
                  </TabsTrigger>
                  <TabsTrigger value="asset" className="text-xs">
                    <Smile className="mr-1 h-3.5 w-3.5" /> Stiker
                  </TabsTrigger>
                </TabsList>

                <div className="pt-3">
                  <TabsContent value="preset" className="m-0">
                    <PresetPanel
                      edit={draft}
                      onChange={(partial) => updateDraft((prev) => ({ ...prev, ...partial }))}
                    />
                  </TabsContent>

                  <TabsContent value="subtitle" className="m-0">
                    <SubtitlePanel
                      captions={draft.captions}
                      onChangeCaptions={(captions) => updateDraft((prev) => ({ ...prev, captions }))}
                      onTriggerAiTranscribe={handleTriggerTranscribe}
                      isTranscribing={isTranscribing}
                      startFrame={draft.startFrame}
                      endFrame={draft.endFrame}
                    />
                  </TabsContent>

                  <TabsContent value="asset" className="m-0">
                    <AssetPanel
                      effects={draft.effects}
                      onChangeEffects={(effects) => updateDraft((prev) => ({ ...prev, effects }))}
                      momentFrame={draft.momentFrame}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* Center Column: Video Player / Preview & Range Controls */}
            <div className="col-span-6 flex flex-col items-center justify-between overflow-y-auto p-4 gap-3">
              {/* Tab Switcher between Remotion 9:16 and Source Player */}
              <div className="flex w-full items-center justify-center">
                <div className="flex rounded-md border border-[#30383c] bg-[#111416] p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveCenterTab("output")}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      activeCenterTab === "output"
                        ? "bg-[#30383c] text-[#EDF1EE]"
                        : "text-[#A9B4B1] hover:text-[#EDF1EE]"
                    }`}
                  >
                    Hasil 9:16 (Preview Remotion)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCenterTab("source")}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      activeCenterTab === "source"
                        ? "bg-[#30383c] text-[#EDF1EE]"
                        : "text-[#A9B4B1] hover:text-[#EDF1EE]"
                    }`}
                  >
                    Sumber Gameplay (Pilih Rentang)
                  </button>
                </div>
              </div>

              {/* Player View */}
              <div className="w-full max-w-xl">
                {activeCenterTab === "output" ? (
                  <OutputPreview
                    edit={draft}
                    sourceUrl={sourceUrl}
                    assetUrls={{}}
                    onFrameUpdate={setCurrentOutputFrame}
                  />
                ) : (
                  <SourcePlayer
                    src={sourceUrl}
                    durationFrames={draft.endFrame}
                    startFrame={draft.startFrame}
                    endFrame={draft.endFrame}
                    momentFrame={draft.momentFrame}
                    onSetStart={(f) => updateDraft((prev) => ({ ...prev, startFrame: f }))}
                    onSetEnd={(f) => updateDraft((prev) => ({ ...prev, endFrame: f }))}
                    onSetMoment={(f) => updateDraft((prev) => ({ ...prev, momentFrame: f }))}
                  />
                )}
              </div>

              {/* Range Controls */}
              <div className="w-full max-w-xl">
                <RangeControls
                  durationFrames={draft.endFrame}
                  startFrame={draft.startFrame}
                  endFrame={draft.endFrame}
                  momentFrame={draft.momentFrame}
                  onChangeRange={(s, e, m) =>
                    updateDraft((prev) => ({
                      ...prev,
                      startFrame: s,
                      endFrame: e,
                      momentFrame: m,
                    }))
                  }
                />
              </div>
            </div>

            {/* Right Column: AI Suggestions */}
            <div className="col-span-3 flex flex-col border-l border-[#30383c] bg-[#191e21] p-3 overflow-y-auto">
              <SuggestionPanel
                suggestions={suggestions}
                onApplySuggestion={handleApplySuggestion}
                onDismissSuggestion={handleDismissSuggestion}
                onTriggerSuggestions={handleTriggerSuggestions}
                isLoading={isSuggesting}
              />
            </div>
          </div>

          {/* Bottom Panel: Compiled Output Timeline */}
          <div className="h-44 shrink-0 border-t border-[#30383c] bg-[#191e21] p-2">
            <OutputTimeline
              edit={draft}
              currentFrame={currentOutputFrame}
              onSeek={setCurrentOutputFrame}
            />
          </div>
        </div>
      )}

      {/* Render Lifecycle Dialog */}
      <RenderDialog
        isOpen={isRenderDialogOpen}
        onClose={() => setIsRenderDialogOpen(false)}
        jobId={renderJobId}
        projectName={project?.name ?? "Video Momen"}
      />
    </div>
  );
};

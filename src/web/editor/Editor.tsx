"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilm,
  faFloppyDisk,
  faPlay,
  faUpload,
  faPlus,
  faLayerGroup,
  faClosedCaptioning,
  faFaceSmile,
  faCheck,
  faCircleExclamation,
  faArrowLeft,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Suggestion } from "@/shared/suggestions";
import type { Asset } from "@/shared/edit";
import {
  fetchProjects,
  fetchAssets,
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

export interface EditorProps {
  initialProjectId?: string | null;
  onNavigateHome?: () => void;
  /** Route-owned selection: changing the project must update the URL, not local state. */
  onSelectProject?: (id: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ initialProjectId, onNavigateHome, onSelectProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const assetRequestGeneration = useRef(0);
  const [activeCenterTab, setActiveCenterTab] = useState<"output" | "source">("output");
  const [activeToolTab, setActiveToolTab] = useState("preset");
  // Below xl the workspace collapses to a single pane switched by this tab strip.
  const [mobilePane, setMobilePane] = useState<"tools" | "preview" | "saran">("preview");
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
    updateDraft,
    save,
  } = useProject(selectedProjectId);

  useEffect(() => {
    // The URL owns the selection; never silently switch to the first project.
    void fetchProjects().then(setProjects).catch(() => {});
    void fetchHealth().then(setHealth).catch(() => {});
  }, []);

  // State updates happen only in async continuations so the effect never renders synchronously.
  const fetchAssetCatalog = useCallback(() => {
    const generation = assetRequestGeneration.current + 1;
    assetRequestGeneration.current = generation;
    return fetchAssets().then(
      (list) => {
        if (assetRequestGeneration.current !== generation) return;
        setAssets(list);
        setAssetsError(null);
        setAssetsLoading(false);
      },
      (error: unknown) => {
        if (assetRequestGeneration.current !== generation) return;
        setAssetsError(error instanceof Error ? error.message : String(error));
        setAssetsLoading(false);
      },
    );
  }, []);

  const retryAssets = useCallback(() => {
    setAssetsLoading(true);
    setAssetsError(null);
    void fetchAssetCatalog();
  }, [fetchAssetCatalog]);

  useEffect(() => {
    void fetchAssetCatalog();
    return () => {
      assetRequestGeneration.current += 1;
    };
  }, [fetchAssetCatalog]);

  // Only validated catalog assets become renderer URLs; effects never supply arbitrary URLs.
  const assetUrls = useMemo(() => Object.fromEntries(
    assets
      .filter((asset) => asset.kind === "image" || asset.kind === "audio")
      .map((asset) => [asset.id, `/api/assets/${encodeURIComponent(asset.id)}/content`]),
  ) as Record<string, string>, [assets]);

  // Full source duration comes from the Asset, not the trimmable endFrame.
  const sourceDurationFrames = useMemo(() => {
    const fallback = draft?.endFrame ?? 0;
    if (!project) return fallback;
    return assets.find((asset) => asset.id === project.assetId)?.durationFrames ?? fallback;
  }, [assets, project, draft?.endFrame]);

  const handleAssetUploaded = useCallback((asset: Asset) => {
    setAssets((previous) => previous.some((existing) => existing.id === asset.id) ? previous : [...previous, asset]);
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
    <div className="flex h-screen w-full flex-col bg-background text-foreground font-ui">
      {/* Top Header */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          {onNavigateHome && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNavigateHome}
              className="h-8 gap-1.5 border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Kembali ke Beranda"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
              <span>Beranda</span>
            </Button>
          )}

          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFilm} className="h-5 w-5 text-primary" />
            <span className="hidden whitespace-nowrap font-heading font-bold tracking-tight text-foreground sm:inline">Takefield Studio</span>
          </div>

          {/* Project selector: selection is route-owned so Back/Forward stays correct. */}
          <select
            aria-label="Pilih proyek"
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              // Route-owned selection remounts with the new id; keep the value URL-consistent.
              if (onSelectProject) onSelectProject(e.target.value);
              else setSelectedProjectId(e.target.value);
            }}
            className="h-8 min-w-0 max-w-[8.5rem] truncate rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUploadNewVideo}
              disabled={isUploadingSource}
            />
            <FontAwesomeIcon icon={faPlus} className="mr-1.5 h-3.5 w-3.5" />
            {isUploadingSource ? "Mengunggah..." : "Video Baru"}
          </label>
        </div>

        {/* Center / Right Header Status */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-xs">
            {health?.ai && !health.ai.enabled && (
              <span
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                title="Dukungan AI OpenRouter dinonaktifkan sementara"
              >
                AI Nonaktif
              </span>
            )}
            {isDirty ? (
              <span className="flex items-center gap-1 text-track-moment">
                <FontAwesomeIcon icon={faCircleExclamation} className="h-3.5 w-3.5" /> Belum Tersimpan
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400">
                <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" /> Tersimpan (Rev {project?.revision ?? 1})
              </span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void save()}
            disabled={!isDirty || isSaving}
            className="h-8 border-border bg-background text-xs text-foreground hover:bg-muted"
          >
            <FontAwesomeIcon icon={faFloppyDisk} className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? "Menyimpan..." : "Simpan"}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleTriggerRender}
            disabled={!draft}
            className="h-8 bg-primary text-xs font-semibold text-primary-foreground hover:brightness-105 active:scale-[0.98] transition-all"
          >
            <FontAwesomeIcon icon={faPlay} className="mr-1.5 h-3.5 w-3.5" />
            Render 9:16
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      {!draft ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <FontAwesomeIcon icon={faFilm} className="h-10 w-10 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Belum Ada Proyek yang Dipilih</h2>
            <p className="max-w-md text-xs text-muted-foreground">
              Pilih proyek di atas atau unggah video gameplay berdurasi 3–5 menit untuk memulai mengedit momen lucu.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-105 active:scale-[0.98] transition-all">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUploadNewVideo}
              disabled={isUploadingSource}
            />
            <FontAwesomeIcon icon={faUpload} className="mr-2 h-4 w-4" />
            Unggah Video Gameplay
          </label>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Below xl: one main area at a time so panels never become mini columns. */}
          <div
            role="tablist"
            aria-label="Area kerja editor"
            className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1.5 xl:hidden"
          >
            {([
              { id: "tools", label: "Tools", icon: faLayerGroup },
              { id: "preview", label: "Hasil / Sumber", icon: faFilm },
              { id: "saran", label: "Saran", icon: faWandMagicSparkles },
            ] as const).map((pane) => (
              <button
                key={pane.id}
                type="button"
                role="tab"
                aria-selected={mobilePane === pane.id}
                aria-label={`Tampilkan ${pane.label}`}
                onClick={() => setMobilePane(pane.id)}
                className={`inline-flex flex-1 items-center justify-center rounded px-2 py-1.5 text-xs font-medium ${
                  mobilePane === pane.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FontAwesomeIcon icon={pane.icon} className="mr-1.5 h-3.5 w-3.5" />
                {pane.label}
              </button>
            ))}
          </div>

          {/* Middle Workspace: 3 Columns on xl (Tools | Preview | AI Suggestions) */}
          <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-12">
            {/* Left Column: Tools (Presets, Subtitles, Assets) */}
            <div className={`min-w-0 flex-col overflow-y-auto border-border bg-card p-3 xl:col-span-3 xl:flex xl:border-r ${mobilePane === "tools" ? "flex" : "hidden"}`}>
              <Tabs value={activeToolTab} onValueChange={setActiveToolTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-background p-0.5">
                  <TabsTrigger value="preset" className="text-xs">
                    <FontAwesomeIcon icon={faLayerGroup} className="mr-1.5 h-3.5 w-3.5" /> Preset
                  </TabsTrigger>
                  <TabsTrigger value="subtitle" className="text-xs">
                    <FontAwesomeIcon icon={faClosedCaptioning} className="mr-1.5 h-3.5 w-3.5" /> Subtitle
                  </TabsTrigger>
                  <TabsTrigger value="asset" className="text-xs">
                    <FontAwesomeIcon icon={faFaceSmile} className="mr-1.5 h-3.5 w-3.5" /> Stiker
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
                      aiEnabled={Boolean(health?.ai?.enabled)}
                    />
                  </TabsContent>

                  <TabsContent value="asset" className="m-0">
                    <AssetPanel
                      assets={assets}
                      isLoading={assetsLoading}
                      error={assetsError}
                      onRetry={retryAssets}
                      onAssetUploaded={handleAssetUploaded}
                      effects={draft.effects}
                      onChangeEffects={(effects) => updateDraft((prev) => ({ ...prev, effects }))}
                      momentFrame={draft.momentFrame}
                      endFrame={draft.endFrame}
                      durationFrames={sourceDurationFrames}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* Center Column: Video Player / Preview & Range Controls */}
            <div className={`min-w-0 flex-col items-center justify-between gap-3 overflow-y-auto p-4 xl:col-span-6 xl:flex ${mobilePane === "preview" ? "flex" : "hidden"}`}>
              {/* Tab Switcher between Remotion 9:16 and Source Player */}
              <div className="flex w-full items-center justify-center">
                <div className="flex rounded-md border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveCenterTab("output")}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      activeCenterTab === "output"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Hasil 9:16 (Preview Remotion)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCenterTab("source")}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      activeCenterTab === "source"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
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
                    assetUrls={assetUrls}
                    onFrameUpdate={setCurrentOutputFrame}
                  />
                ) : (
                  <SourcePlayer
                    src={sourceUrl}
                    durationFrames={sourceDurationFrames}
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
                  durationFrames={sourceDurationFrames}
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
            <div className={`min-w-0 flex-col overflow-y-auto border-border bg-card p-3 xl:col-span-3 xl:flex xl:border-l ${mobilePane === "saran" ? "flex" : "hidden"}`}>
              <SuggestionPanel
                suggestions={suggestions}
                onApplySuggestion={handleApplySuggestion}
                onDismissSuggestion={handleDismissSuggestion}
                onTriggerSuggestions={handleTriggerSuggestions}
                isLoading={isSuggesting}
                aiEnabled={Boolean(health?.ai?.enabled)}
              />
            </div>
          </div>

          {/* Bottom Panel: Compiled Output Timeline */}
          <div className="h-44 shrink-0 border-t border-border bg-card p-2">
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

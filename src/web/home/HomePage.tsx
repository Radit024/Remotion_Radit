"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilm,
  faPlus,
  faUpload,
  faGamepad,
  faMicrophone,
  faSliders,
  faMagnifyingGlass,
  faRotateRight,
  faTrashCan,
  faPlay,
  faClock,
  faVideo,
  faLayerGroup,
  faWandMagicSparkles,
  faGear,
  faHardDrive,
  faCircleExclamation,
  faFolderOpen,
  faArrowRight,
  faSpinner,
  faFileVideo,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchProjects,
  createProject,
  uploadAsset,
  deleteProject,
  fetchHealth,
  type ProjectSummary,
  type HealthInfo,
} from "@/web/api";

export interface HomePageProps {
  onOpenProject: (projectId: string) => void;
  onNewProject: (projectId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "baru saja";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mnt lalu`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} hari lalu`;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  } catch {
    return "beberapa saat lalu";
  }
}

export const HomePage: React.FC<HomePageProps> = ({ onOpenProject, onNewProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<"home" | "projects" | "presets" | "renders" | "settings">("home");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [list, sysHealth] = await Promise.all([
        fetchProjects(),
        fetchHealth().catch(() => null),
      ]);
      setProjects(list);
      setHealth(sysHealth);
    } catch (err) {
      console.error("Gagal memuat data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleProcessUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      const asset = await uploadAsset(file);
      const projectName = file.name.replace(/\.[^/.]+$/, "");
      const newProj = await createProject(asset.id, projectName);

      setProjects((prev) => [
        {
          id: newProj.id,
          name: newProj.name,
          updatedAt: newProj.updatedAt,
          sourceName: asset.name,
          assetId: asset.id,
        },
        ...prev,
      ]);

      onNewProject(newProj.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessUpload(file);
    }
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      void handleProcessUpload(file);
    } else if (file) {
      setUploadError("Harap masukkan berkas rekaman video (.mp4, .mov, .mkv).");
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Hapus proyek "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    try {
      setDeletingProjectId(id);
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(`Gagal menghapus proyek: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingProjectId(null);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sourceName.toLowerCase().includes(q),
    );
  }, [projects, searchQuery]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground font-ui">
      {/* ─── LEFT SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border bg-card/60 select-none">
        {/* Studio Branding */}
        <div className="p-4 border-b border-border flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <FontAwesomeIcon icon={faFilm} className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-bold text-sm tracking-tight text-foreground">
              Takefield Studio
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              Desktop Console v1.0
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Menu Utama
          </div>
          <button
            type="button"
            onClick={() => setActiveNav("home")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNav === "home"
                ? "bg-muted text-foreground border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <FontAwesomeIcon icon={faVideo} className="h-3.5 w-3.5 text-primary" />
            <span>Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("projects")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNav === "projects"
                ? "bg-muted text-foreground border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FontAwesomeIcon icon={faFolderOpen} className="h-3.5 w-3.5" />
              <span>Semua Proyek</span>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
              {projects.length}
            </span>
          </button>

          <div className="pt-4 px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Alat & Sumber Daya
          </div>

          <button
            type="button"
            onClick={() => setActiveNav("presets")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNav === "presets"
                ? "bg-muted text-foreground border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5" />
            <span>Preset & Meme SFX</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("renders")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNav === "renders"
                ? "bg-muted text-foreground border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
            <span>Antrean Render</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("settings")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNav === "settings"
                ? "bg-muted text-foreground border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5" />
            <span>Pengaturan Engine</span>
          </button>
        </div>

        {/* System Health / Footer Info (NO FAKE DOTS) */}
        <div className="p-3 border-t border-border bg-card/40 space-y-2">
          <div className="text-[11px] text-muted-foreground font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faHardDrive} className="h-3 w-3" />
              <span>FFmpeg</span>
            </span>
            <span className={health?.ffmpeg ? "text-primary" : "text-destructive"}>
              {health?.ffmpeg ? "Siap" : "Tidak Terdeteksi"}
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
              <span>Whisper STT</span>
            </span>
            <span className={health?.ai?.configured ? "text-primary" : "text-muted-foreground"}>
              {health?.ai?.configured ? "Terkonfigurasi" : "Lokal / Default"}
            </span>
          </div>

          <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>Keluaran: 1080×1920 (9:16)</span>
            <span>30 FPS</span>
          </div>
        </div>
      </aside>

      {/* ─── MAIN DASHBOARD ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-background overflow-hidden">
        {/* Top Control Bar */}
        <header className="h-14 shrink-0 flex items-center justify-between border-b border-border bg-card/40 px-6 gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Cari proyek atau berkas rekaman gameplay..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-9 bg-background border-border text-xs text-foreground placeholder:text-muted-foreground rounded-md focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="h-8 gap-1.5 text-xs border-border bg-background hover:bg-muted text-foreground"
              title="Perbarui daftar proyek"
            >
              <FontAwesomeIcon icon={faRotateRight} className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Perbarui</span>
            </Button>

            {projects.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenProject(projects[0].id)}
                className="h-8 gap-1.5 text-xs bg-muted text-foreground hover:bg-muted/80 border border-border"
              >
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                <span>Buka Proyek Terakhir</span>
              </Button>
            )}
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="panel-scroll flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
          {/* Upload Status / Error alert */}
          {uploadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-xs hover:underline cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* ─── SECTION 1: HERO CTA BANNER ────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="rounded-xl border border-border bg-card p-6 md:p-7 relative overflow-hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column: Heading & Value Prop */}
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Buat Proyek Video Baru
                </h1>

                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed max-w-xl">
                  Unggah rekaman gameplay mentah (.mp4, .mov, .mkv). Video akan diproses otomatis dengan proxy lokal berkecepatan tinggi, siap dianalisis transkrip Whisper dan dipotong ke format vertikal 9:16.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-10 px-5 gap-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:brightness-105 active:scale-[0.98] transition-all shadow-none"
                  >
                    {isUploading ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" />
                        <span>Mengunggah & Memproses...</span>
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                        <span>Pilih Video Gameplay</span>
                      </>
                    )}
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                    disabled={isUploading}
                  />

                  <span className="text-xs text-muted-foreground font-mono">
                    Format: 1080×1920 (9:16) • Hingga 2 GB
                  </span>
                </div>
              </div>

              {/* Right Column: Interactive Drag & Drop Box */}
              <div className="lg:col-span-5">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`rounded-lg border-2 border-dashed p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[160px] ${
                    isDragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/50 bg-background/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2.5">
                    {isUploading ? (
                      <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
                    )}
                  </div>
                  <div className="font-heading font-medium text-xs text-foreground">
                    {isUploading ? "Sedang Mengunggah Video..." : "Tarik & Lepas Video ke Sini"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
                    Atau klik untuk menelusuri berkas dari komputer (didukung hingga 2 GB).
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* ─── SECTION 2: AI CREATION STUDIO (MODULAR SUITE) ────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground tracking-tight">
                  AI Creation Studio
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pilih alur kerja pintar untuk memotong dan mengolah rekaman secara terarah.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* CARD 1: AI GAMING CLIP EDITOR (FLAGSHIP - AKTIF) */}
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border border-primary/40 bg-card p-5 flex flex-col justify-between hover:border-primary transition-colors group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <FontAwesomeIcon icon={faGamepad} className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-mono text-primary font-medium">
                      Siap Digunakan
                    </span>
                  </div>

                  <div>
                    <h3 className="font-heading font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                      AI Gaming Clip Editor
                    </h3>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Deteksi otomatis puncak audio dan reaksi heboh, potong vertikal 9:16 untuk Shorts & TikTok, serta sinkronisasi subtitle kinetik Whisper dan sound effect meme.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 mt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      if (projects.length > 0) {
                        onOpenProject(projects[0].id);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="w-full h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold hover:brightness-105 active:scale-[0.98] transition-all"
                  >
                    <span>Mulai Klip Gaming</span>
                    <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>

              {/* CARD 2: PODCAST & TALKING HEAD (SLOT FITUR BERIKUTNYA) */}
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border border-border bg-card/60 p-5 flex flex-col justify-between opacity-85 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      <FontAwesomeIcon icon={faMicrophone} className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Segera Hadir
                    </span>
                  </div>

                  <div>
                    <h3 className="font-heading font-semibold text-sm text-foreground">
                      Podcast & Talking Head
                    </h3>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Pemotongan otomatis jeda hening percakapan, peralihan multi-kamera cerdas mengikuti pembicara aktif, dan transkrip bersih bebas kata pengisi.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 mt-4">
                  <Button
                    type="button"
                    disabled
                    variant="outline"
                    className="w-full h-8 text-xs border-border bg-muted text-muted-foreground cursor-not-allowed"
                  >
                    Dalam Pengembangan
                  </Button>
                </div>
              </motion.div>

              {/* CARD 3: KUSTOM / TAMBAH ALUR KERJA BARU (EXTENSIBILITY) */}
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border border-dashed border-border bg-card/40 p-5 flex flex-col justify-between hover:border-muted-foreground transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      <FontAwesomeIcon icon={faSliders} className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Modular
                    </span>
                  </div>

                  <div>
                    <h3 className="font-heading font-semibold text-sm text-foreground">
                      Tambah Alur Kerja Baru
                    </h3>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Hubungkan pipeline modular untuk tutorial rekaman layar dengan zoom kursor otomatis, video reaksi streamer, atau generator klip promosi vertikal.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => alert("Arsitektur alur kerja modular siap dihubungkan dengan modul pipeline baru.")}
                    className="w-full h-8 text-xs border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Lihat Konfigurasi
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ─── SECTION 3: RECENT PROJECTS (DAFTAR PROYEK TERAKHIR) ───────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-base font-semibold text-foreground tracking-tight">
                  Proyek Terakhir
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground rounded bg-muted px-2 py-0.5 border border-border">
                  {filteredProjects.length}
                </span>
              </div>

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Reset filter pencarian
                </button>
              )}
            </div>

            {/* Empty State */}
            {filteredProjects.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/40 p-10 text-center flex flex-col items-center justify-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <FontAwesomeIcon icon={faFileVideo} className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-heading font-medium text-sm text-foreground">
                    {searchQuery ? "Tidak Ada Proyek yang Cocok" : "Belum Ada Proyek Gameplay"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {searchQuery
                      ? `Tidak ditemukan proyek yang cocok dengan kata kunci "${searchQuery}".`
                      : "Unggah rekaman gameplay pertama kamu di bagian atas untuk mulai memotong momen lucu."}
                  </p>
                </div>
                {!searchQuery && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold hover:brightness-105"
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                    <span>Buat Proyek Pertama</span>
                  </Button>
                )}
              </div>
            ) : (
              /* Projects Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => onOpenProject(project.id)}
                    className="group rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer flex flex-col overflow-hidden relative"
                  >
                    {/* Thumbnail preview area (Aspect 16:9) */}
                    <div className="aspect-video w-full bg-background relative overflow-hidden border-b border-border flex items-center justify-center">
                      {project.assetId ? (
                        <video
                          src={`/api/assets/${project.assetId}/content?proxy=true#t=0.5`}
                          preload="metadata"
                          muted
                          className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <FontAwesomeIcon icon={faFilm} className="h-6 w-6 opacity-40" />
                        </div>
                      )}

                      {/* Aspect Ratio Tag */}
                      <span className="absolute top-2 left-2 bg-background/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        9:16 Shorts
                      </span>

                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 bg-background/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                          <FontAwesomeIcon icon={faPlay} className="h-4 w-4 ml-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Metadata Card Info */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h4 className="font-heading font-medium text-xs text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {project.name}
                        </h4>
                        <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                          {project.sourceName}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(project.updatedAt)}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                            disabled={deletingProjectId === project.id}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Hapus proyek"
                          >
                            <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

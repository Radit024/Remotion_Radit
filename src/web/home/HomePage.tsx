"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faBars, faFilm, faFolderOpen, faHardDrive, faMagnifyingGlass,
  faRotateRight, faSpinner, faUpload, faVideo, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIMITS } from "@/shared/edit";
import { fetchProjects, createProject, uploadAsset, deleteProject, fetchHealth, type HealthInfo } from "@/web/api";
import { deriveEngineStatus } from "@/web/engine-status";
import { ProjectCard, type ProjectCardProject } from "./ProjectCard";

export interface HomePageProps {
  onOpenProject: (projectId: string) => void;
  onNewProject: (projectId: string) => void;
  view?: "home" | "projects";
}

const VIDEO_FORMATS: Record<string, readonly string[]> = {
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  mkv: ["video/x-matroska", "video/matroska", "application/x-matroska"],
  webm: ["video/webm"],
  avi: ["video/x-msvideo", "video/avi", "video/vnd.avi"],
  m4v: ["video/mp4", "video/x-m4v"],
};
const VIDEO_ACCEPT = Object.entries(VIDEO_FORMATS)
  .flatMap(([extension, types]) => [`.${extension}`, ...types]).join(",");
const SORT_OPTIONS = [
  { value: "updated", label: "Terakhir diperbarui" },
  { value: "name", label: "Nama (A–Z)" },
];
const BATCH_SIZE = 24;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Permintaan gagal. Silakan coba lagi.";
}

function updatedTime(project: ProjectCardProject): number {
  const time = Date.parse(project.updatedAt);
  return Number.isFinite(time) ? time : 0;
}

function Brand() {
  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <FontAwesomeIcon icon={faFilm} aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-sm font-bold leading-5">Takefield Studio</p>
        <p className="text-xs leading-4 text-muted-foreground">Editor video lokal</p>
      </div>
    </div>
  );
}

function SidebarContent({ view, count, health, healthError, onNavigate }: {
  view: "home" | "projects";
  count?: number;
  health: HealthInfo | null;
  healthError: boolean;
  onNavigate?: () => void;
}) {
  const engine = deriveEngineStatus(health);
  const issues = [...new Set([...engine.stt.issues, ...engine.suggestions.issues])];
  return (
    <>
      <nav aria-label="Navigasi utama" className="flex-1 space-y-1 p-3">
        {([
          { view: "home", href: "/", label: "Beranda", icon: faVideo },
          { view: "projects", href: "/?view=projects", label: "Semua Proyek", icon: faFolderOpen },
        ] as const).map((item) => (
          <Link
            key={item.view}
            href={item.href}
            aria-current={view === item.view ? "page" : undefined}
            onClick={(event) => {
              if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.();
            }}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
              view === item.view ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <FontAwesomeIcon icon={item.icon} aria-hidden="true" className={`size-4 ${view === item.view ? "text-primary" : ""}`} />
            <span className="flex-1">{item.label}</span>
            {item.view === "projects" && count !== undefined ? (
              <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">{count}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      <section aria-label="Status engine" className="space-y-3 border-t border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FontAwesomeIcon icon={faHardDrive} aria-hidden="true" className="size-4 text-muted-foreground" />
          Status engine
        </h2>
        <p className="text-[13px] leading-5 text-muted-foreground">{engine.label}</p>
        <dl className="space-y-2 text-xs leading-4">
          <div className="space-y-1"><dt className="text-foreground">FFmpeg</dt><dd className="text-muted-foreground">{engine.ffmpeg.label}</dd></div>
          <div className="space-y-1"><dt className="text-foreground">Transkripsi</dt><dd className="text-muted-foreground">{engine.stt.label}</dd></div>
          <div className="space-y-1"><dt className="text-foreground">Saran klip</dt><dd className="text-muted-foreground">{engine.suggestions.label}</dd></div>
        </dl>
        {issues.length > 0 ? (
          <ul className="space-y-1 break-words text-[13px] leading-5 text-muted-foreground">
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        ) : null}
        {healthError ? <p className="text-[13px] leading-5 text-muted-foreground">Status tidak dapat dimuat. Gunakan Perbarui proyek untuk mencoba lagi.</p> : null}
      </section>
    </>
  );
}

export function HomePage({ onOpenProject, onNewProject, view = "home" }: HomePageProps) {
  const [projects, setProjects] = useState<ProjectCardProject[] | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPending = useRef(false);
  const deletePending = useRef<string | null>(null);
  const projectsPending = useRef(false);
  const projectsRequest = useRef(0);
  const healthRequest = useRef(0);
  const mounted = useRef(false);
  const isUploading = uploadStage !== "idle";

  const loadProjects = useCallback(() => {
    if (projectsPending.current || deletePending.current) return;
    projectsPending.current = true;
    const request = ++projectsRequest.current;
    return fetchProjects().then((list) => {
      if (mounted.current && request === projectsRequest.current) setProjects(list);
    }).catch((error: unknown) => {
      if (mounted.current && request === projectsRequest.current) setListError(errorMessage(error));
    }).finally(() => {
      if (mounted.current && request === projectsRequest.current) {
        projectsPending.current = false;
        setIsLoading(false);
      }
    });
  }, []);

  const loadHealth = useCallback(() => {
    const request = ++healthRequest.current;
    return fetchHealth().then((nextHealth) => {
      if (mounted.current && request === healthRequest.current) {
        setHealth(nextHealth);
        setHealthError(false);
      }
    }).catch(() => {
      if (mounted.current && request === healthRequest.current) {
        setHealth(null);
        setHealthError(true);
      }
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadProjects();
    void loadHealth();
    return () => {
      mounted.current = false;
      projectsRequest.current += 1;
      healthRequest.current += 1;
      projectsPending.current = false;
    };
  }, [loadProjects, loadHealth]);

  const refresh = () => {
    if (projectsPending.current || deletePending.current) return;
    setIsLoading(true);
    setListError(null);
    void loadProjects();
    void loadHealth();
  };

  const openPicker = () => {
    if (!uploadPending.current) fileInputRef.current?.click();
  };

  const processFiles = async (files: FileList | File[]) => {
    // State may not have rendered yet when a second picker/drop event arrives.
    if (uploadPending.current || files.length === 0) return;
    setUploadError(null);
    if (files.length !== 1) {
      setUploadError("Pilih satu video untuk setiap proyek.");
      return;
    }
    const file = files[0];
    const extension = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? "";
    const mime = file.type.split(";")[0].trim().toLowerCase();
    const types = Object.hasOwn(VIDEO_FORMATS, extension) ? VIDEO_FORMATS[extension] : undefined;
    if (!types || (mime !== "" && mime !== "application/octet-stream" && !types.includes(mime))) {
      setUploadError("Format video tidak didukung atau tipe berkas tidak sesuai. Pilih MP4, MOV, MKV, WebM, AVI, atau M4V.");
      return;
    }
    uploadPending.current = true;
    setIsDragging(false);
    setUploadStage("uploading");
    try {
      const asset = await uploadAsset(file);
      if (!mounted.current) return;
      setUploadStage("creating");
      const name = file.name.replace(/\.[^/.]+$/, "").trim().slice(0, LIMITS.nameMax) || "Proyek video";
      const project = await createProject(asset.id, name);
      if (mounted.current) onNewProject(project.id);
    } catch (error) {
      if (mounted.current) setUploadError(errorMessage(error));
    } finally {
      uploadPending.current = false;
      if (mounted.current) setUploadStage("idle");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (deletePending.current || projectsPending.current) return;
    if (!window.confirm(`Hapus proyek "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    deletePending.current = id;
    setDeletingProjectId(id);
    setDeleteError(null);
    try {
      await deleteProject(id);
      if (mounted.current) setProjects((previous) => previous?.filter((project) => project.id !== id) ?? null);
    } catch (error) {
      if (mounted.current) setDeleteError(`Gagal menghapus proyek: ${errorMessage(error)}`);
    } finally {
      deletePending.current = null;
      if (mounted.current) setDeletingProjectId(null);
    }
  };

  const sortedProjects = useMemo(() => {
    const query = view === "projects" ? searchQuery.trim().toLocaleLowerCase("id-ID") : "";
    const filtered = (projects ?? []).filter((project) => !query ||
      project.name.toLocaleLowerCase("id-ID").includes(query) || project.sourceName.toLocaleLowerCase("id-ID").includes(query));
    return filtered.sort((a, b) => {
      if (view === "projects" && sort === "name") {
        return a.name.localeCompare(b.name, "id-ID", { numeric: true, sensitivity: "base" }) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
      }
      return updatedTime(b) - updatedTime(a) || a.name.localeCompare(b.name, "id-ID") || a.id.localeCompare(b.id);
    });
  }, [projects, searchQuery, sort, view]);
  const visibleProjects = sortedProjects.slice(0, view === "home" ? 6 : visibleCount);
  const hasList = projects !== null;
  const clearSearch = () => { setSearchQuery(""); setVisibleCount(BATCH_SIZE); };
  const sidebarProps = { view, count: projects?.length, health, healthError };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background font-ui text-sm text-foreground selection:bg-primary/20 selection:text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 md:flex">
        <Brand />
        <div className="panel-scroll flex min-h-0 flex-1 flex-col"><SidebarContent {...sidebarProps} /></div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-2 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DialogTrigger render={<Button type="button" variant="outline" className="size-11 md:hidden" />} aria-label="Buka navigasi">
                <FontAwesomeIcon icon={faBars} aria-hidden="true" className="size-4" />
              </DialogTrigger>
              <DialogContent
                aria-modal="true"
                showCloseButton={false}
                className="top-0 bottom-0 left-0 flex h-dvh w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-border p-0 font-ui sm:max-w-none"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <DialogTitle className="font-heading text-base font-semibold">Navigasi studio</DialogTitle>
                  <DialogClose render={<Button type="button" variant="ghost" className="size-11" />} aria-label="Tutup navigasi">
                    <FontAwesomeIcon icon={faXmark} aria-hidden="true" className="size-4" />
                  </DialogClose>
                </div>
                <DialogDescription className="sr-only">Navigasi Takefield Studio dan status engine.</DialogDescription>
                <div className="panel-scroll flex min-h-0 flex-1 flex-col">
                  <SidebarContent {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
                </div>
              </DialogContent>
            </Dialog>
            <h1 className="truncate font-heading text-2xl font-bold tracking-tight">{view === "home" ? "Beranda" : "Semua Proyek"}</h1>
          </div>
          <Button type="button" variant="outline" onClick={refresh} disabled={isLoading || !!deletingProjectId} aria-label="Perbarui proyek" className="h-11 gap-2 px-3 text-sm">
            <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" className={`size-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            <span className="hidden sm:inline">Perbarui</span>
          </Button>
        </header>
        <div className="panel-scroll min-h-0 flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          <section aria-labelledby="upload-heading" className="space-y-3">
            <div className="space-y-1">
              <h2 id="upload-heading" className="font-heading text-base font-semibold">Buat proyek video baru</h2>
              <p className="text-[13px] leading-5 text-muted-foreground">Unggah rekaman untuk membuka editor dan mulai memilih momen.</p>
            </div>
            <input
              ref={fileInputRef} type="file" aria-label="Berkas video" accept={VIDEO_ACCEPT} disabled={isUploading} className="hidden"
              onChange={(event) => {
                if (event.target.files) void processFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = uploadPending.current ? "none" : "copy";
                if (!uploadPending.current) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void processFiles(event.dataTransfer.files);
              }}
            >
              <Button
                type="button" variant="outline" disabled={isUploading} onClick={openPicker} aria-describedby="upload-help"
                className={`h-auto min-h-32 w-full flex-col gap-3 whitespace-normal rounded-xl border-dashed p-5 text-center text-sm ${isDragging ? "border-primary bg-primary/5" : "bg-card/40"}`}
              >
                <FontAwesomeIcon icon={isUploading ? faSpinner : faUpload} aria-hidden="true" className={`size-5 text-primary ${isUploading ? "animate-spin motion-reduce:animate-none" : ""}`} />
                <span className="font-semibold">Pilih video <span className="font-normal text-muted-foreground">atau tarik dan lepas di sini</span></span>
              </Button>
            </div>
            <p id="upload-help" className="text-[13px] leading-5 text-muted-foreground">MP4, MOV, MKV, WebM, AVI, M4V. Validasi akhir dan pemrosesan dilakukan server.</p>
            {isUploading ? (
              <p role="status" aria-label="Status unggahan" className="text-sm leading-5">
                {uploadStage === "uploading" ? "Mengunggah dan memproses video…" : "Membuat proyek…"}
              </p>
            ) : null}
            {uploadError ? <p role="alert" className="break-words text-sm leading-5 text-destructive">Unggahan gagal: {uploadError} Pilih video untuk mencoba lagi.</p> : null}
          </section>
          <section aria-labelledby="projects-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="projects-heading" className="font-heading text-base font-semibold">{view === "home" ? "Proyek terakhir" : "Daftar proyek"}</h2>
              {view === "home" ? (
                <Link href="/?view=projects" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary">
                  Lihat semua proyek <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" className="size-4" />
                </Link>
              ) : hasList ? <p className="text-xs tabular-nums text-muted-foreground" role="status">{visibleProjects.length} dari {sortedProjects.length} proyek</p> : null}
            </div>
            {view === "projects" ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="project-search" className="sr-only">Cari proyek</label>
                  <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="project-search" type="search" value={searchQuery} placeholder="Cari nama proyek atau berkas sumber…" className="h-11 bg-card/40 pl-10 text-base caret-primary md:text-sm"
                    onChange={(event) => { setSearchQuery(event.target.value); setVisibleCount(BATCH_SIZE); }} />
                </div>
                <Select items={SORT_OPTIONS} value={sort} onValueChange={(value) => {
                  if (value === "updated" || value === "name") { setSort(value); setVisibleCount(BATCH_SIZE); }
                }}>
                  <SelectTrigger aria-label="Urutkan proyek" className="w-full min-w-52 bg-card/40 text-sm data-[size=default]:h-11 sm:w-auto"><SelectValue /></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11 text-sm">{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {isLoading ? <p role="status" className="text-sm text-muted-foreground">{hasList ? "Memperbarui proyek…" : "Memuat proyek…"}</p> : null}
            {listError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-4 text-sm">
                <p className="min-w-0 break-words">{hasList ? "Gagal memperbarui proyek. Daftar terakhir tetap ditampilkan." : "Gagal memuat proyek."} {listError}</p>
                <Button type="button" variant="outline" onClick={refresh} disabled={isLoading} className="h-11 px-4 text-sm">Coba lagi</Button>
              </div>
            ) : null}
            {deleteError ? <p role="alert" className="break-words text-sm leading-5 text-destructive">{deleteError}</p> : null}
            {hasList && projects.length === 0 ? (
              <div className="space-y-2 rounded-xl border border-border bg-card/40 p-6 text-center">
                <h3 className="font-heading text-base font-semibold">Belum ada proyek</h3>
                <p className="text-[13px] leading-5 text-muted-foreground">Pilih atau lepas video di bagian atas untuk membuat proyek pertama.</p>
              </div>
            ) : hasList && sortedProjects.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-border bg-card/40 p-6 text-center">
                <h3 className="font-heading text-base font-semibold">Tidak ada proyek yang cocok</h3>
                <p className="break-words text-[13px] leading-5 text-muted-foreground">Tidak ditemukan nama proyek atau sumber untuk “{searchQuery.trim()}”.</p>
                <Button type="button" variant="outline" onClick={clearSearch} className="h-11 px-4 text-sm">Hapus pencarian</Button>
              </div>
            ) : hasList ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} onOpenProject={onOpenProject} onDelete={(id, name) => void handleDelete(id, name)} deleting={deletingProjectId === project.id} deleteDisabled={isLoading || !!deletingProjectId} />)}
              </div>
            ) : null}
            {view === "projects" && visibleProjects.length < sortedProjects.length ? (
              <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + BATCH_SIZE)} className="h-11 px-5 text-sm">Tampilkan lebih banyak</Button></div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

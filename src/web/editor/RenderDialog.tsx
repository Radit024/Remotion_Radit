"use client";

import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faCircleXmark, faCircleCheck, faSpinner, faVideo } from "@fortawesome/free-solid-svg-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { JobInfo } from "@/web/api";
import { fetchJob, cancelJob } from "@/web/api";

type RenderDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string | null;
  projectName: string;
};

const lifecycle: Record<JobInfo["status"], { title: string; description: string }> = {
  queued: { title: "Dalam antrean worker", description: "Render menunggu worker lokal. Belum ada MP4; Anda dapat membatalkan antrean." },
  running: { title: "Sedang merender video", description: "Worker lokal sedang membuat MP4. Menutup dialog tidak membatalkan render." },
  succeeded: { title: "Render Berhasil Selesai!", description: "Video tersimpan secara lokal. Unduh MP4 hasil render di bawah." },
  failed: { title: "Render Gagal", description: "Periksa pesan kesalahan, tutup dialog, lalu perbaiki proyek atau media sebelum menjalankan Render lagi." },
  cancelled: { title: "Render Dibatalkan", description: "Render dibatalkan. Draft proyek dan media sumber tetap tersimpan; jalankan Render lagi jika diperlukan." },
  interrupted: { title: "Render Terhenti", description: "Worker berhenti sebelum render selesai. Periksa atau mulai ulang worker lokal, lalu tutup dialog dan jalankan Render lagi." },
};

export const RenderDialog: React.FC<RenderDialogProps> = (props) => (
  <RenderJobDialog key={`${props.jobId}-${props.isOpen}`} {...props} />
);

const RenderJobDialog: React.FC<RenderDialogProps> = ({ isOpen, onClose, jobId, projectName }) => {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(Boolean(isOpen && jobId));
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const generation = useRef(0);
  const cancelling = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  useEffect(() => {
    if (!isOpen || !jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollGeneration = ++generation.current;
    const poll = async () => {
      if (!active || pollGeneration !== generation.current) return;
      try {
        const info = await fetchJob(jobId);
        if (!active || pollGeneration !== generation.current) return;
        setJob(info);
        setPollError(null);
        setIsChecking(false);
        if (info.status === "queued" || info.status === "running") timer = setTimeout(poll, 1000);
      } catch (error) {
        if (!active || pollGeneration !== generation.current) return;
        setIsChecking(false);
        setPollError(`Tidak dapat memeriksa status render: ${error instanceof Error ? error.message : String(error)}. Status terakhir mungkin sudah berubah; coba periksa lagi.`);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [isOpen, jobId, refreshVersion]);

  const retryPoll = () => {
    setPollError(null);
    setIsChecking(true);
    setRefreshVersion((version) => version + 1);
  };
  const handleCancel = async () => {
    if (!jobId || cancelling.current) return;
    cancelling.current = true;
    generation.current += 1;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelJob(jobId);
      if (!live.current) return;
      setJob(result);
      setIsChecking(false);
      setPollError(null);
      if (result.status === "queued" || result.status === "running") setRefreshVersion((version) => version + 1);
    } catch (error) {
      if (!live.current) return;
      setCancelError(`Pembatalan render gagal: ${error instanceof Error ? error.message : String(error)}. Render mungkin masih berjalan; coba batalkan lagi.`);
      setRefreshVersion((version) => version + 1);
    } finally {
      cancelling.current = false;
      if (live.current) setIsCancelling(false);
    }
  };

  const activeJob = job?.status === "queued" || job?.status === "running";
  const progress = typeof job?.progress === "number" && Number.isFinite(job.progress) ? Math.round(Math.max(0, Math.min(1, job.progress)) * 100) : undefined;
  const state = job ? lifecycle[job.status] : null;
  const failed = job?.status === "failed" || job?.status === "interrupted";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="editor-panel max-h-[90dvh] overflow-y-auto border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 type-panel-title"><FontAwesomeIcon aria-hidden="true" icon={faVideo} className="h-4 w-4 text-primary" /> Ekspor Video 9:16 — {projectName}</DialogTitle>
          <DialogDescription className="type-help text-muted-foreground">1080 × 1920 (9:16), 30 FPS, H.264 / AAC melalui Remotion Renderer Lokal</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2 type-control">
          {!job && <p role="status" className="type-help text-muted-foreground">{!jobId ? "Job render belum tersedia. Tutup dialog lalu jalankan Render dari proyek." : isChecking ? "Memeriksa status render…" : "Status render belum diketahui. Periksa status lagi sebelum mengambil tindakan."}</p>}
          {state && <div role={failed ? "alert" : "status"} className={`flex flex-col gap-2 rounded-lg border p-3 ${failed ? "border-rose-500/30 text-rose-400" : job?.status === "succeeded" ? "border-emerald-500/30 text-emerald-400" : "border-border text-foreground"}`}>
            <p className="flex items-center gap-2 font-semibold"><FontAwesomeIcon aria-hidden="true" icon={job?.status === "succeeded" ? faCircleCheck : activeJob ? faSpinner : faCircleXmark} className={activeJob ? "animate-spin motion-reduce:animate-none" : ""} /> {state.title}</p>
            <p className="type-help text-muted-foreground">{state.description}</p>
            {job?.error?.message && <p className="type-help">{job.error.message}</p>}
          </div>}
          {activeJob && <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-2"><span className="type-help text-muted-foreground">{progress === undefined ? "Progres belum tersedia; status akan diperbarui otomatis." : "Progres render"}</span><span className="type-timecode text-primary">{progress === undefined ? "Menunggu progres…" : `${progress}%`}</span></div>
            <progress aria-label="Progres render" max={100} value={progress} className="h-2 w-full accent-primary" />
          </div>}
          {job?.status === "succeeded" && (job.outputId ? <a href={`/api/outputs/${encodeURIComponent(job.outputId)}`} download className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 type-control font-semibold text-primary-foreground"><FontAwesomeIcon aria-hidden="true" icon={faDownload} /> Unduh MP4 Hasil Render</a> : <p role="alert" className="type-help text-track-moment">Render selesai tetapi berkas hasil belum tersedia. Coba periksa status lagi atau periksa worker lokal.</p>)}
          {pollError && <div role="alert" className="flex flex-col gap-2 type-help text-rose-400"><p>{pollError}</p><Button type="button" size="sm" variant="outline" onClick={retryPoll} disabled={isChecking || isCancelling} className="w-fit type-control">Coba Periksa Status Lagi</Button></div>}
          {cancelError && <p role="alert" className="type-help text-rose-400">{cancelError}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {job?.status === "succeeded" && !job.outputId && <Button type="button" size="sm" variant="outline" onClick={retryPoll} disabled={isChecking} className="type-control">Periksa Status Lagi</Button>}
          {activeJob && <Button type="button" size="sm" variant="outline" onClick={() => void handleCancel()} disabled={isCancelling} className="type-control text-rose-400">{isCancelling ? "Membatalkan…" : cancelError ? "Coba Batalkan Lagi" : "Batalkan Render"}</Button>}
          <Button type="button" size="sm" variant="outline" onClick={onClose} className="type-control">{activeJob ? "Tutup Dialog" : "Tutup"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

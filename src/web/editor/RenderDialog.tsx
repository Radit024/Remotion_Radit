"use client";

import React, { useState, useEffect } from "react";
import { Download, XCircle, CheckCircle2, Loader2, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { JobInfo } from "@/web/api";
import { fetchJob, cancelJob } from "@/web/api";

type RenderDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string | null;
  projectName: string;
};

export const RenderDialog: React.FC<RenderDialogProps> = ({
  isOpen,
  onClose,
  jobId,
  projectName,
}) => {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!isOpen || !jobId) {
      setJob(null);
      return;
    }

    let isMounted = true;
    let timer: NodeJS.Timeout;

    const poll = async () => {
      try {
        const info = await fetchJob(jobId);
        if (isMounted) {
          setJob(info);
          if (info.status === "queued" || info.status === "running") {
            timer = setTimeout(poll, 1000);
          }
        }
      } catch {
        if (isMounted) timer = setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, jobId]);

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      setIsCancelling(true);
      const res = await cancelJob(jobId);
      setJob(res);
    } catch {
      /* ignore cancel error */
    } finally {
      setIsCancelling(false);
    }
  };

  const progressPercent = Math.round((job?.progress ?? 0) * 100);
  const isDone = job?.status === "succeeded";
  const isFailed = job?.status === "failed";
  const isCancelled = job?.status === "cancelled";
  const isRunning = job?.status === "running" || job?.status === "queued";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isRunning && onClose()}>
      <DialogContent className="border-[#30383c] bg-[#191e21] text-[#EDF1EE] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-[#EDF1EE]">
            <Video className="h-5 w-5 text-[#D4F77C]" />
            Ekspor Video 9:16 — {projectName}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#A9B4B1]">
            1080 × 1920 (9:16), 30 FPS, H.264 / AAC via Remotion Renderer Lokal
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-xs">
          {/* Progress Indicator */}
          {isRunning && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[#A9B4B1]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4F77C]" />
                  {job?.status === "queued" ? "Dalam antrean worker..." : "Sedang merender video..."}
                </span>
                <span className="font-mono text-[#D4F77C]">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-[#111416]" />
            </div>
          )}

          {/* Succeeded */}
          {isDone && (
            <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Render Berhasil Selesai!
              </div>
              <p className="text-[11px] text-[#A9B4B1]">
                Video tersimpan secara lokal. Klik tombol di bawah untuk mengunduh MP4 ke perangkat Anda.
              </p>
              {job?.outputId && (
                <a
                  href={`/api/outputs/${job.outputId}`}
                  download
                  className="inline-flex items-center justify-center rounded-md bg-[#D4F77C] px-3 py-2 text-xs font-semibold text-[#111416] hover:bg-[#D4F77C]/90"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Unduh MP4 Hasil Render
                </a>
              )}
            </div>
          )}

          {/* Failed or Cancelled */}
          {(isFailed || isCancelled) && (
            <div className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <XCircle className="h-4 w-4" />
                {isCancelled ? "Render Dibatalkan" : "Render Gagal"}
              </div>
              <p className="text-[11px] text-[#A9B4B1]">
                {job?.error?.message ?? "Terjadi kendala saat merender video."}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30383c]">
          {isRunning ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isCancelling}
              className="border-rose-500/40 text-xs text-rose-400 hover:bg-rose-500/10"
            >
              {isCancelling ? "Membatalkan..." : "Batalkan Render"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onClose}
              className="border-[#30383c] bg-[#111416] text-xs text-[#EDF1EE] hover:bg-[#30383c]"
            >
              Tutup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

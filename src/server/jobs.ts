import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Edit } from "@/shared/edit";
import { editSchema } from "@/shared/edit";
import { dirs } from "./env";
import { ApiError } from "./guard";
import { readAssetManifest, readAssetFile, requireAsset, toPublicAsset } from "./assets";
import { readProject, withLock } from "./projects";
import { readJsonIfExists, removeIfExists, storagePaths, writeJsonAtomic } from "./storage";

export const JOB_KINDS = ["proxy", "transcribe", "suggestions", "render"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL_STATUSES: JobStatus[] = ["succeeded", "failed", "cancelled", "interrupted"];

export type JobError = { code: string; message: string };

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  projectId: string | null;
  revision: number | null;
  progress: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  snapshot: Edit | null;
  result: unknown | null;
  error: JobError | null;
  outputId: string | null;
  cancelRequested: boolean;
};

function jobDir(): string {
  return dirs().jobs;
}

function jobPath(id: string): string {
  return path.join(jobDir(), `${id}.json`);
}

function cancelMarkerPath(id: string): string {
  return path.join(dirs().tmp, `cancel-${id}.marker`);
}

export function readJob(id: string): Job | null {
  const value = readJsonIfExists<Job>(jobPath(id));
  if (!value || typeof value.id !== "string") return null;
  return value;
}

export function requireJob(id: string): Job {
  const job = readJob(id);
  if (!job) throw new ApiError("NOT_FOUND", `Job ${id} tidak ditemukan`);
  return job;
}

export function listJobs(): Job[] {
  try {
    return fs
      .readdirSync(jobDir())
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJsonIfExists<Job>(path.join(jobDir(), name)))
      .filter((job): job is Job => Boolean(job));
  } catch {
    return [];
  }
}

export function writeJob(job: Job): void {
  writeJsonAtomic(jobPath(job.id), job);
}

export function publicJob(job: Job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    projectId: job.projectId,
    revision: job.revision,
    progress: job.progress,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error,
    outputId: job.outputId,
  };
}

export type CreateJobInput = {
  kind: JobKind;
  projectId: string;
  expectedRevision: number;
};

export function createJob(input: CreateJobInput): Job {
  const project = readProject(input.projectId);
  if (project.revision !== input.expectedRevision) {
    throw new ApiError(
      "REVISION_CONFLICT",
      `Proyek sudah tersimpan pada revisi ${project.revision}; muat ulang sebelum menjalankan pekerjaan`,
    );
  }
  if (input.kind === "render" && project.endFrame <= project.startFrame) {
    throw new ApiError("VALIDATION", "Rentang sumber kosong");
  }
  if ((input.kind === "transcribe" || input.kind === "suggestions") && !project.assetId) {
    throw new ApiError("VALIDATION", "Proyek tidak memiliki sumber");
  }
  const manifest = readAssetManifest();
  const asset = manifest[project.assetId];
  if (!asset) {
    throw new ApiError("ASSET_NOT_FOUND", "Aset sumber tidak ditemukan");
  }
  if (input.kind === "transcribe" && !asset.hasAudio) {
    throw new ApiError("NO_AUDIO", "Sumber tidak memiliki track audio");
  }

  const heavyKinds: JobKind[] = ["render", "transcribe", "proxy"];
  if (heavyKinds.includes(input.kind)) {
    const active = listJobs().find(
      (job) => job.status === "running" || job.status === "queued",
    );
    if (active) {
      if (input.kind === "render" && active.kind === "render" && active.projectId === input.projectId && active.revision === project.revision) {
        return active;
      }
      throw new ApiError("BUSY", "Pekerjaan berat lain sedang berjalan; tunggu atau batalkan");
    }
  }

  const parsed = editSchema.passthrough().safeParse(project);
  if (!parsed.success) {
    throw new ApiError("VALIDATION", "Snapshot proyek tidak valid");
  }

  const id = randomUUID();
  const job: Job = {
    id,
    kind: input.kind,
    status: "queued",
    projectId: input.projectId,
    revision: project.revision,
    progress: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    snapshot: JSON.parse(JSON.stringify(parsed.data)) as Edit,
    result: null,
    error: null,
    outputId: null,
    cancelRequested: false,
  };
  writeJob(job);
  return job;
}

export function requestCancel(id: string): Promise<Job> {
  return withLock(`job-${id}`, () => {
    const job = requireJob(id);
    if (TERMINAL_STATUSES.includes(job.status)) return job;
    job.cancelRequested = true;
    writeJob(job);
    fs.mkdirSync(dirs().tmp, { recursive: true });
    fs.writeFileSync(cancelMarkerPath(id), String(Date.now()), "utf8");
    return job;
  });
}

export function isCancelRequested(id: string): boolean {
  return fs.existsSync(cancelMarkerPath(id));
}

export function clearCancelMarker(id: string): void {
  removeIfExists(cancelMarkerPath(id));
}

export function activeJobForProject(projectId: string): Job | null {
  return (
    listJobs().find(
      (job) => job.projectId === projectId && (job.status === "running" || job.status === "queued"),
    ) ?? null
  );
}

export function markInterruptedOnBoot(): void {
  for (const job of listJobs()) {
    if (job.status === "running" || job.status === "queued") {
      job.status = "interrupted";
      job.finishedAt = new Date().toISOString();
      job.error = { code: "INTERRUPTED", message: "Proses berhenti sebelum pekerjaan selesai" };
      writeJob(job);
      clearCancelMarker(job.id);
    }
  }
}

export type JobContext = {
  job: Job;
  signal: AbortSignal;
  updateProgress: (value: number) => void;
};

export type JobHandler = (context: JobContext) => Promise<JobResult>;

export type JobResult = {
  result?: unknown;
  outputId?: string | null;
};

export type JobRunner = (context: JobContext) => Promise<JobResult>;

export type WorkerState = {
  running: boolean;
  currentJobId: string | null;
  timers: NodeJS.Timeout | null;
};

let runner: JobRunner | null = null;

export function setJobRunner(next: JobRunner): void {
  runner = next;
}

const TICK_MS = 500;

export function createWorker(): {
  start: () => void;
  stop: () => Promise<void>;
  state: WorkerState;
} {
  const state: WorkerState = { running: false, currentJobId: null, timers: null };

  const processJob = async (job: Job): Promise<void> => {
    const controller = new AbortController();
    const markerTimer = setInterval(() => {
      if (isCancelRequested(job.id)) controller.abort();
    }, 200);

    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progress = 0;
    writeJob(job);
    state.currentJobId = job.id;

    try {
      if (!runner) throw new Error("Job runner belum dikonfigurasi");
      const outcome = await runner({
        job,
        signal: controller.signal,
        updateProgress: (value: number) => {
          job.progress = Math.max(0, Math.min(1, value));
          writeJob(job);
        },
      });
      job.status = "succeeded";
      job.result = outcome.result ?? null;
      job.outputId = outcome.outputId ?? null;
      job.progress = 1;
    } catch (error) {
      if (controller.signal.aborted) {
        job.status = "cancelled";
        job.error = { code: "CANCELLED", message: "Pekerjaan dibatalkan pengguna" };
      } else {
        job.status = "failed";
        const message = error instanceof Error ? error.message : String(error);
        const code =
          typeof (error as { code?: unknown }).code === "string"
            ? ((error as { code: string }).code)
            : "RENDER_FAILED";
        job.error = { code, message: message.slice(0, 400) };
      }
    } finally {
      clearInterval(markerTimer);
      clearCancelMarker(job.id);
      job.finishedAt = new Date().toISOString();
      writeJob(job);
      state.currentJobId = null;
    }
  };

  const tick = async () => {
    if (!state.running) return;
    if (state.currentJobId) return;
    const next = listJobs().find((job) => job.status === "queued");
    if (next) {
      await processJob(next);
    }
  };

  return {
    state,
    start() {
      if (state.running) return;
      state.running = true;
      markInterruptedOnBoot();
      state.timers = setInterval(() => {
        void tick();
      }, TICK_MS);
    },
    async stop() {
      state.running = false;
      if (state.timers) clearInterval(state.timers);
      state.timers = null;
    },
  };
}

export function outputPathFor(outputId: string): string {
  const stored = readJsonIfExists<{ file?: string }>(path.join(dirs().outputs, `${outputId}.json`));
  if (!stored?.file) {
    throw new ApiError("NOT_FOUND", "Output tidak ditemukan");
  }
  return path.join(dirs().outputs, stored.file);
}

export { storagePaths, requireAsset, readAssetFile, toPublicAsset };
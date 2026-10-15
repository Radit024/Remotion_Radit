import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Edit } from "@/shared/edit";
import { assetSchema, editSchema, validateEdit, ValidationError } from "@/shared/edit";
import { dirs } from "./env";
import { ApiError, assertUuid } from "./guard";
import { assetContentPath, getAsset, requireAsset, toPublicAsset, type StoredAsset } from "./assets";
import { listJsonFiles, readJson, storagePaths, StorageError, writeJsonAtomic, writeJsonExclusive } from "./storage";

const LOCK_STALE_MS = 60_000;
const NEW_PROJECT_ATTEMPTS = 5;

export type SourceStatus = "metadata-missing" | "file-missing" | "available";

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  sourceName: string;
  assetId?: string;
  sourceStatus?: SourceStatus;
};

function sourceStatus(assetId: string): SourceStatus {
  const asset = getAsset(assetId);
  if (!asset) return "metadata-missing";
  try {
    assetContentPath(asset);
    return "available";
  } catch {
    return "file-missing";
  }
}

function projectPath(id: string): string {
  return path.join(dirs().projects, `${id}.json`);
}

function lockPath(name: string): string {
  return path.join(dirs().locks, `${name}.lock`);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    if (process.platform === "win32") {
      const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], {
        encoding: "utf8",
        windowsHide: true,
      });
      return result.status === 0 && typeof result.stdout === "string" && result.stdout.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function withLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const target = lockPath(name);
  fs.mkdirSync(dirs().locks, { recursive: true });
  const deadline = Date.now() + 10_000;
  let handle: number | null = null;

  for (;;) {
    try {
      handle = fs.openSync(target, "wx");
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: Date.now() }), "utf8");
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      let stale = false;
      try {
        const info = fs.readFileSync(target, "utf8");
        const parsed = JSON.parse(info) as { pid?: number; at?: number };
        const age = Date.now() - (parsed.at ?? 0);
        if (age > LOCK_STALE_MS && parsed.pid !== undefined && !isPidAlive(parsed.pid)) {
          stale = true;
        }
        if (age > 10 * LOCK_STALE_MS) stale = true;
      } catch {
        stale = true;
      }
      if (stale) {
        try {
          fs.rmSync(target, { force: true });
        } catch {
          /* ignore */
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new ApiError("BUSY", "Sumber daya sedang terkunci oleh proses lain");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await fn();
  } finally {
    if (handle !== null) {
      try {
        fs.closeSync(handle);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmSync(target, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function listProjects(): ProjectSummary[] {
  const summaries: ProjectSummary[] = [];
  for (const file of listJsonFiles(dirs().projects)) {
    try {
      const edit = readJson<Edit>(file);
      const source = (() => {
        try {
          return requireAsset(edit.assetId).name;
        } catch {
          return "sumber hilang";
        }
      })();
      summaries.push({
        id: edit.id,
        name: edit.name,
        updatedAt: typeof (edit as unknown as { updatedAt?: string }).updatedAt === "string"
          ? ((edit as unknown as { updatedAt: string }).updatedAt)
          : fs.statSync(file).mtime.toISOString(),
        sourceName: source,
        assetId: edit.assetId,
        sourceStatus: sourceStatus(edit.assetId),
      });
    } catch {
      /* ignore malformed projects in list */
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

type PersistedProject = Edit & { createdAt: string; updatedAt: string };
export type StoredProject = PersistedProject & { sourceStatus: SourceStatus };

export function readProject(id: string): StoredProject {
  assertUuid(id, "id proyek");
  const file = projectPath(id);
  if (!fs.existsSync(file)) {
    throw new ApiError("PROJECT_NOT_FOUND", `Proyek ${id} tidak ditemukan`);
  }
  let raw: unknown;
  try {
    raw = readJson(file);
  } catch {
    throw new ApiError("VALIDATION", "Berkas proyek rusak dan tidak dapat dibaca");
  }
  const parsed = editSchema.strip().safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION", "Isi proyek tidak valid");
  }
  const stored = raw as PersistedProject;
  return {
    ...parsed.data,
    createdAt: typeof stored.createdAt === "string" ? stored.createdAt : "",
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
    sourceStatus: sourceStatus(parsed.data.assetId),
  };
}

export function deleteProject(id: string): void {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new ApiError("VALIDATION", "id proyek tidak valid");
  }
  const file = projectPath(id);
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
  }
}

export function createProject(assetId: string, name: string | undefined): StoredProject {
  const asset = requireAsset(assetId);
  if (asset.kind !== "video") {
    throw new ApiError("VALIDATION", "Sumber proyek harus berupa video");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const resolvedName = (name ?? asset.name).slice(0, 120);
  const edit: Edit = {
    id,
    revision: 1,
    assetId: asset.id,
    name: resolvedName,
    startFrame: 0,
    endFrame: asset.durationFrames,
    momentFrame: Math.floor(asset.durationFrames / 2),
    preset: "light",
    layout: "contain",
    focusX: 0.5,
    focusY: 0.5,
    captionY: 0.72,
    freezeFrames: 0,
    replayFrames: 0,
    captions: [],
    effects: [],
  };
  const stored = publishNewProject({ ...edit, createdAt: now, updatedAt: now });
  return { ...stored, sourceStatus: sourceStatus(stored.assetId) };
}

export function saveProject(id: string, draft: Edit, expectedRevision: number): Promise<StoredProject> {
  return withLock(`project-${id}`, () => {
    const existing = readProject(id);
    if (expectedRevision !== existing.revision) {
      throw new ApiError(
        "REVISION_CONFLICT",
        `Proyek sudah tersimpan pada revisi ${existing.revision}; muat ulang sebelum menyimpan lagi`,
      );
    }
    const asset = requireAsset(existing.assetId);
    const related = listRelatedAssets(draft);
    const cleanDraft = { ...draft } as Partial<StoredProject>;
    delete cleanDraft.createdAt;
    delete cleanDraft.updatedAt;
    delete cleanDraft.sourceStatus;
    const validated = validateEdit({ ...cleanDraft, id: existing.id, assetId: existing.assetId }, asset, related);
    const now = new Date().toISOString();
    const stored: PersistedProject = {
      ...validated,
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    writeJsonAtomic(projectPath(id), stored);
    return { ...stored, sourceStatus: sourceStatus(stored.assetId) };
  });
}

export function writeNewProject(edit: PersistedProject): void {
  const clean = editSchema.strip().parse(edit);
  writeJsonExclusive(projectPath(clean.id), { ...clean, createdAt: edit.createdAt, updatedAt: edit.updatedAt });
}

function publishNewProject(edit: PersistedProject): PersistedProject {
  let candidate = edit;
  for (let attempt = 0; attempt < NEW_PROJECT_ATTEMPTS; attempt += 1) {
    try {
      writeNewProject(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof StorageError) || error.code !== "FILE_EXISTS") throw error;
      if (attempt < NEW_PROJECT_ATTEMPTS - 1) candidate = { ...edit, id: randomUUID() };
    }
  }
  throw new ApiError("DISK_WRITE_FAILED", "Gagal membuat ID proyek baru setelah lima percobaan; proyek yang sudah ada tidak diubah");
}

export async function recoverProjectSource(
  id: string,
  assetId: string,
  expectedRevision: number,
): Promise<StoredProject> {
  assertUuid(id, "id proyek");
  assertUuid(assetId, "assetId");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
    throw new ApiError("VALIDATION", "revision harus berupa integer positif");
  }
  return withLock(`project-${id}`, () => {
    const existing = readProject(id);
    if (expectedRevision !== existing.revision) {
      throw new ApiError("REVISION_CONFLICT", `Proyek sudah tersimpan pada revisi ${existing.revision}; muat ulang sebelum memulihkan sumber`);
    }
    const asset = requireAsset(assetId);
    if (asset.kind !== "video") throw new ApiError("VALIDATION", "Sumber proyek harus berupa video");
    if (!assetSchema.safeParse(toPublicAsset(asset)).success || asset.durationFrames <= 0 || asset.width <= 0 || asset.height <= 0) {
      throw new ApiError("VALIDATION", "Metadata sumber video tidak valid");
    }
    assetContentPath(asset);
    const related = listRelatedAssets(existing);
    for (const item of related) {
      if (!assetSchema.safeParse(toPublicAsset(item)).success) throw new ApiError("VALIDATION", "Metadata aset terkait tidak valid");
      assetContentPath(item);
    }
    const suffix = " (salinan)";
    const clone = {
      ...editSchema.strip().parse(existing),
      id: randomUUID(),
      assetId,
      revision: 1,
      name: `${existing.name.slice(0, 120 - suffix.length).trimEnd()}${suffix}`,
    };
    let validated: Edit;
    try {
      validated = validateEdit(clone, asset, related);
      // Captions/effects may live outside the selection, but never outside the source.
      if (clone.captions.some((caption) => caption.startFrame >= caption.endFrame || caption.endFrame > asset.durationFrames)
        || clone.effects.some((effect) => effect.endFrame > asset.durationFrames)) {
        throw new ValidationError(["Timing subtitle/efek melewati durasi sumber atau tidak valid"]);
      }
      const byId = new Map(related.map((item) => [item.id, item]));
      if (clone.effects.some((effect) => (effect.kind === "image" && byId.get(effect.assetId ?? "")?.kind !== "image")
        || (effect.kind === "sfx" && byId.get(effect.assetId ?? "")?.kind !== "audio"))) {
        throw new ValidationError(["Jenis aset subtitle/efek tidak sesuai"]);
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new ApiError("VALIDATION", error.message);
      throw error;
    }
    const now = new Date().toISOString();
    const stored = publishNewProject({ ...validated, createdAt: now, updatedAt: now });
    return { ...stored, sourceStatus: "available" };
  });
}

function listRelatedAssets(draft: Edit): StoredAsset[] {
  const ids = new Set(
    draft.effects.map((effect) => effect.assetId).filter((value): value is string => Boolean(value)),
  );
  const assets: StoredAsset[] = [];
  for (const assetId of ids) {
    try {
      const asset = requireAsset(assetId);
      assets.push(asset);
    } catch {
      throw new ApiError("VALIDATION", `Aset ${assetId} tidak ditemukan`);
    }
  }
  return assets;
}

export function outputDirectory(): string {
  return storagePaths().outputs;
}
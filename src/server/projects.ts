import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Asset, Edit } from "@/shared/edit";
import { editSchema, validateEdit } from "@/shared/edit";
import { dirs } from "./env";
import { ApiError } from "./guard";
import { requireAsset } from "./assets";
import { listJsonFiles, readJson, storagePaths, writeJsonAtomic } from "./storage";

const LOCK_STALE_MS = 60_000;

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  sourceName: string;
};

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
      });
    } catch {
      /* ignore malformed projects in list */
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type StoredProject = Edit & { createdAt: string; updatedAt: string };

export function readProject(id: string): StoredProject {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new ApiError("VALIDATION", "id proyek tidak valid");
  }
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
  const parsed = editSchema.passthrough().safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION", "Isi proyek tidak valid");
  }
  const stored = raw as StoredProject;
  return { ...parsed.data, createdAt: stored.createdAt ?? "", updatedAt: stored.updatedAt ?? "" };
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
  const stored: StoredProject = { ...edit, createdAt: now, updatedAt: now };
  writeNewProject(stored);
  return stored;
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
    const { createdAt: _ca, updatedAt: _ua, ...cleanDraft } = draft as unknown as StoredProject;
    const validated = validateEdit({ ...cleanDraft, id: existing.id, assetId: existing.assetId }, asset, related);
    const now = new Date().toISOString();
    const stored: StoredProject = {
      ...validated,
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    writeJsonAtomic(projectPath(id), stored);
    return stored;
  });
}

export function writeNewProject(edit: StoredProject): void {
  fs.mkdirSync(dirs().projects, { recursive: true });
  writeJsonAtomic(projectPath(edit.id), edit);
}

function listRelatedAssets(draft: Edit): Asset[] {
  const ids = new Set(
    draft.effects.map((effect) => effect.assetId).filter((value): value is string => Boolean(value)),
  );
  const assets: Asset[] = [];
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
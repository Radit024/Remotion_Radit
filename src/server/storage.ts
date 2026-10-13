import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dirs, ensureDataDirs } from "./env";

export class StorageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `${randomUUID()}.tmp`);
  let handle: number | undefined;
  try {
    handle = fs.openSync(tempPath, "wx");
    fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    let renamed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempPath, filePath);
        renamed = true;
        break;
      } catch (err) {
        const errCode = (err as NodeJS.ErrnoException).code;
        if ((errCode === "EPERM" || errCode === "EBUSY" || errCode === "EACCES") && attempt < 4) {
          const waitTill = Date.now() + 10 * (attempt + 1);
          while (Date.now() < waitTill) {}
          continue;
        }
        if (attempt === 4) {
          // Fallback to copy and unlink
          try {
            fs.copyFileSync(tempPath, filePath);
            fs.rmSync(tempPath, { force: true });
            renamed = true;
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    } catch {
      /* ignore */
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new StorageError(
      "DISK_WRITE_FAILED",
      `Gagal menyimpan ${path.basename(filePath)}: ${reason}. File lama tidak diubah.`,
    );
  }
}

export function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return readJson<T>(filePath);
}

export function removeIfExists(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* best effort */
  }
}

export function listJsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

export function ensureDirs(): void {
  ensureDataDirs();
}

export const storagePaths = dirs;

export function isManagedPath(candidate: string, base: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(candidate);
  if (resolved === resolvedBase) return true;
  return resolved.startsWith(resolvedBase + path.sep);
}

export function safeFileNameForDownload(name: string): string {
  const cleaned = name.replace(/[\r\n"\\/:*?<>|]+/g, "_").replace(/\s+/g, " ").trim();
  const base = cleaned.length > 0 ? cleaned.slice(0, 120) : "takefield-studio-output";
  return `${base}.mp4`;
}
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Busboy from "busboy";
import type { Asset } from "@/shared/edit";
import { dirs, maxUploadBytes } from "./env";
import { ApiError } from "./guard";
import { inspectMedia, needsPreviewProxy, type MediaKind } from "./media";
import { runTool, ToolError } from "./process";
import { readJsonIfExists, removeIfExists, storagePaths, writeJsonAtomic } from "./storage";

export type StoredAsset = Asset & {
  filename: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  codec: string | null;
  frameRate: number | null;
  proxyRelativePath: string | null;
  createdAt: string;
};

const MANIFEST = "assets.json";

function manifestPath(): string {
  return path.join(dirs().assets, MANIFEST);
}

export function readAssetManifest(): Record<string, StoredAsset> {
  const value = readJsonIfExists<Record<string, StoredAsset>>(manifestPath());
  if (!value || typeof value !== "object") return {};
  const clean: Record<string, StoredAsset> = {};
  for (const [id, asset] of Object.entries(value)) {
    if (asset && typeof asset.id === "string" && asset.relativePath) clean[id] = asset;
  }
  return clean;
}

export function writeAssetManifest(manifest: Record<string, StoredAsset>): void {
  writeJsonAtomic(manifestPath(), manifest);
}

export function listAssets(): StoredAsset[] {
  return Object.values(readAssetManifest());
}

export function getAsset(id: string): StoredAsset | null {
  return readAssetManifest()[id] ?? null;
}

export function requireAsset(id: string): StoredAsset {
  const asset = getAsset(id);
  if (!asset) throw new ApiError("ASSET_NOT_FOUND", `Aset ${id} tidak ditemukan`);
  return asset;
}

export function assetPath(asset: StoredAsset): string {
  return path.join(dirs().assets, asset.relativePath);
}

export function assetContentPath(asset: StoredAsset): string {
  const candidate = assetPath(asset);
  if (!fs.existsSync(candidate)) {
    throw new ApiError("ASSET_NOT_FOUND", `Berkas aset ${asset.id} tidak ada di disk`);
  }
  return candidate;
}

export function toPublicAsset(asset: StoredAsset): Asset {
  return {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    durationFrames: asset.durationFrames,
    width: asset.width,
    height: asset.height,
    hasAudio: asset.hasAudio,
    previewReady: asset.previewReady,
  };
}

const EXTENSION_KIND: Record<string, MediaKind> = {
  mp4: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  avi: "video",
  m4v: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  opus: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
};

const MIME_KIND: Record<string, MediaKind> = {
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/x-matroska": "video",
  "video/webm": "video",
  "video/x-msvideo": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/aac": "audio",
  "audio/ogg": "audio",
  "audio/opus": "audio",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/bmp": "image",
};

const REJECTED_EXTENSIONS = new Set(["svg", "html", "htm", "js", "mjs", "exe", "dll", "bat", "cmd", "ps1", "sh"]);

export function classifyUpload(filename: string, mimeType: string | undefined): MediaKind {
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  if (REJECTED_EXTENSIONS.has(extension)) {
    throw new ApiError("MEDIA_UNSUPPORTED", `Jenis berkas ${extension} tidak diizinkan`);
  }
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (normalizedMime.startsWith("text/") || normalizedMime === "image/svg+xml") {
    throw new ApiError("MEDIA_UNSUPPORTED", "Konten berbasis teks tidak diizinkan sebagai media");
  }
  const byMime = MIME_KIND[normalizedMime];
  if (byMime) return byMime;
  const byExtension = EXTENSION_KIND[extension];
  if (byExtension) return byExtension;
  throw new ApiError("MEDIA_UNSUPPORTED", "Jenis media tidak dikenali");
}

export type ImportResult = { asset: StoredAsset };

export async function importAssetFromRequest(request: Request): Promise<ImportResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("VALIDATION", "Unggahan harus multipart/form-data");
  }
  if (!request.body) {
    throw new ApiError("VALIDATION", "Badan permintaan kosong");
  }

  const limit = maxUploadBytes();
  const tmpDir = dirs().tmp;
  fs.mkdirSync(tmpDir, { recursive: true });

  const nodeStream = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
  const busboy = Busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: { files: 1, fields: 4, fileSize: limit },
  });

  const result = await new Promise<ImportResult>((resolve, reject) => {
    let settled = false;
    let stagingPath: string | null = null;
    let originalName = "";
    let mimeType: string | undefined;
    let bytes = 0;
    let truncated = false;
    let fileCount = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    busboy.on("file", (_fieldname, stream, info) => {
      fileCount += 1;
      if (fileCount > 1) {
        stream.resume();
        finish(() => reject(new ApiError("VALIDATION", "Hanya satu berkas yang boleh diunggah")));
        return;
      }
      originalName = (info.filename || "").slice(0, 200);
      mimeType = info.mimeType;
      stagingPath = path.join(tmpDir, `${randomUUID()}.upload`);
      const out = fs.createWriteStream(stagingPath as string);
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      });
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("error", () => {
        finish(() => reject(new ApiError("VALIDATION", "Aliran unggahan terputus")));
      });
      stream.pipe(out);
      out.on("error", () => {
        finish(() => reject(new ApiError("DISK_WRITE_FAILED", "Gagal menulis berkas sementara")));
      });
    });

    busboy.on("filesLimit", () => {
      finish(() => reject(new ApiError("VALIDATION", "Hanya satu berkas yang boleh diunggah")));
    });

    busboy.on("error", () => {
      finish(() => reject(new ApiError("VALIDATION", "Permintaan multipart tidak valid")));
    });

    busboy.on("close", () => {
      if (truncated) {
        if (stagingPath) removeIfExists(stagingPath);
        finish(() =>
          reject(new ApiError("FILE_TOO_LARGE", `Berkas melebihi batas ${Math.floor(limit / 1024 / 1024)} MiB`)),
        );
        return;
      }
      if (!stagingPath || bytes === 0) {
        finish(() => reject(new ApiError("VALIDATION", "Tidak ada berkas yang diunggah")));
        return;
      }
      finish(() => {
        void (async () => {
          try {
            const asset = await publishStagedFile(stagingPath as string, originalName, mimeType, bytes);
            resolve({ asset });
          } catch (error) {
            removeIfExists(stagingPath as string);
            reject(error);
          }
        })();
      });
    });

    nodeStream.on("error", () => {
      finish(() => reject(new ApiError("VALIDATION", "Aliran permintaan terputus")));
    });
    nodeStream.pipe(busboy);
  });

  return result;
}

async function publishStagedFile(
  stagingPath: string,
  originalName: string,
  mimeType: string | undefined,
  sizeBytes: number,
): Promise<StoredAsset> {
  const displayName = sanitizeDisplayName(originalName);
  const kind = classifyUpload(displayName, mimeType);

  let inspected;
  try {
    inspected = await inspectMedia(stagingPath, kind, sizeBytes);
  } catch (error) {
    if (error instanceof ToolError) {
      throw new ApiError("MEDIA_UNSUPPORTED", "Berkas tidak dapat dibaca sebagai media yang didukung");
    }
    throw error;
  }

  const id = randomUUID();
  const extension = (displayName.split(".").pop() ?? "bin").toLowerCase();
  const relativePath = `${id}.${extension}`;
  const destination = path.join(dirs().assets, relativePath);
  fs.mkdirSync(dirs().assets, { recursive: true });
  fs.renameSync(stagingPath, destination);

  const asset: StoredAsset = {
    id,
    kind,
    name: displayName,
    relativePath,
    filename: `${id}.${extension}`,
    mimeType: mimeType ?? "application/octet-stream",
    sizeBytes,
    durationFrames: inspected.durationFrames,
    width: inspected.width,
    height: inspected.height,
    hasAudio: inspected.hasAudio,
    previewReady: true,
    codec: inspected.codec,
    frameRate: inspected.frameRate,
    proxyRelativePath: null,
    createdAt: new Date().toISOString(),
  };

  const manifest = readAssetManifest();
  manifest[id] = asset;
  writeAssetManifest(manifest);
  return asset;
}

export function sanitizeDisplayName(name: string): string {
  const base = (name || "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned.length > 0 ? cleaned : "media").slice(0, 200);
}

export async function createPreviewProxy(asset: StoredAsset): Promise<StoredAsset> {
  if (asset.kind !== "video") return asset;
  const source = assetContentPath(asset);
  const id = randomUUID();
  const relativePath = `${asset.id}.proxy.mp4`;
  const destination = path.join(dirs().assets, relativePath);
  const args = [
    "-y",
    "-i",
    source,
    "-vf",
    "scale='min(1280,iw)':-2:flags=bicubic",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    destination,
  ];
  try {
    await runTool("ffmpeg", args, { timeoutMs: 15 * 60_000 });
  } catch (error) {
    removeIfExists(destination);
    throw new ApiError(
      "DEPENDENCY_UNAVAILABLE",
      `Gagal membuat proxy preview: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const inspected = await inspectMedia(destination, "video", fs.statSync(destination).size);
  const updated: StoredAsset = {
    ...asset,
    relativePath,
    filename: relativePath,
    mimeType: "video/mp4",
    codec: inspected.codec,
    previewReady: true,
    proxyRelativePath: relativePath,
  };
  const manifest = readAssetManifest();
  manifest[asset.id] = updated;
  writeAssetManifest(manifest);
  void id;
  return updated;
}

export function assetNeedsProxy(asset: StoredAsset): boolean {
  if (asset.kind !== "video") return false;
  return needsPreviewProxy({
    kind: "video",
    codec: asset.codec,
    width: asset.width,
    height: asset.height,
    durationSeconds: null,
    durationFrames: asset.durationFrames,
    hasAudio: asset.hasAudio,
    frameRate: asset.frameRate,
  });
}

export function readAssetFile(asset: StoredAsset, options: { proxy?: boolean } = {}): string {
  if (options.proxy && asset.proxyRelativePath) {
    const proxyPath = path.join(dirs().assets, asset.proxyRelativePath);
    if (fs.existsSync(proxyPath)) return proxyPath;
  }
  return assetContentPath(asset);
}

export function mediaStream(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  const size = fs.statSync(filePath).size;
  const from = Math.max(0, Math.min(start, size));
  const to = Math.max(from, Math.min(end, size - 1));
  const nodeStream = fs.createReadStream(filePath, { start: from, end: to });
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export { storagePaths };
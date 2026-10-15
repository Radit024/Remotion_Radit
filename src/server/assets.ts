import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Busboy from "busboy";
import { z } from "zod";
import type { Asset } from "@/shared/edit";
import { dirs, maxUploadBytes, projectRoot } from "./env";
import { withLock } from "./projects";
import { ApiError } from "./guard";
import { inspectMedia, needsPreviewProxy, type MediaKind } from "./media";
import { runTool, ToolError } from "./process";
import { isManagedPath, readJsonIfExists, removeIfExists, storagePaths, writeJsonAtomic } from "./storage";

export type StoredAsset = Asset & {
  filename: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  codec: string | null;
  frameRate: number | null;
  proxyRelativePath: string | null;
  createdAt: string;
  emojiManifestId?: string;
  emojiSha256?: string;
};

const MANIFEST = "assets.json";
const MANIFEST_LOCK = "asset-manifest";

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

export function assetPath(asset: Pick<StoredAsset, "id" | "relativePath">): string {
  const candidate = path.resolve(dirs().assets, asset.relativePath);
  if (!isManagedPath(candidate, dirs().assets) || candidate === path.resolve(dirs().assets)) {
    throw new ApiError("ASSET_NOT_FOUND", `Berkas aset ${asset.id} tidak tersedia`);
  }
  return candidate;
}

export function assetContentPath(asset: StoredAsset): string {
  const candidate = assetPath(asset);
  try {
    if (!fs.statSync(candidate).isFile() || !isManagedPath(fs.realpathSync(candidate), fs.realpathSync(dirs().assets))) {
      throw new Error("Not a managed file");
    }
    fs.accessSync(candidate, fs.constants.R_OK);
  } catch {
    throw new ApiError("ASSET_NOT_FOUND", `Berkas aset ${asset.id} tidak ada di disk atau tidak dapat dibaca`);
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

const emojiEntrySchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  codepoint: z.string().max(64).regex(/^[a-fA-F0-9]{4,6}(?:-[a-fA-F0-9]{4,6})*$/),
  name: z.string().trim().min(1).max(180).regex(/^[^\u0000-\u001f\u007f]+$/),
  file: z.string().max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/).refine((file) => !file.includes("..")),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  source: z.string().trim().min(1),
  license: z.string().trim().min(1),
});
const emojiManifestSchema = z.object({ emojis: z.array(emojiEntrySchema).min(1).max(64) });
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function emojiImportError(message: string): ApiError {
  return new ApiError("DEPENDENCY_UNAVAILABLE", `Bank emoji lokal: ${message}`);
}

function readEmojiBank() {
  const directory = path.join(projectRoot, "public", "emoji");
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  } catch {
    throw emojiImportError("manifest belum tersedia atau tidak dapat dibaca");
  }
  const parsed = emojiManifestSchema.safeParse(raw);
  if (!parsed.success) throw emojiImportError("manifest kosong atau tidak valid; periksa berkas, hash, dan attribution");
  const ids = new Set<string>();
  const files = new Set<string>();
  const codepoints = new Set<string>();
  return parsed.data.emojis.map((entry) => {
    const codepoint = entry.codepoint.toLowerCase();
    if (ids.has(entry.id) || files.has(entry.file) || codepoints.has(codepoint)) throw emojiImportError("id, codepoint, atau berkas manifest duplikat");
    ids.add(entry.id);
    files.add(entry.file);
    codepoints.add(codepoint);
    const file = path.join(directory, entry.file);
    let bytes: Buffer;
    try {
      if (!fs.lstatSync(file).isFile() || !isManagedPath(fs.realpathSync(file), fs.realpathSync(directory))) {
        throw new Error("Not a local regular file");
      }
      const size = fs.statSync(file).size;
      if (size > 25 * 1024 * 1024) throw new Error("Image too large");
      bytes = fs.readFileSync(file);
    } catch {
      throw emojiImportError(`berkas untuk ${entry.id} tidak tersedia sebagai PNG lokal`);
    }
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256.toLowerCase()) {
      throw emojiImportError(`hash ${entry.id} tidak cocok`);
    }
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
      throw emojiImportError(`${entry.id} bukan PNG yang valid`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width === 0 || height === 0 || width > 8192 || height > 8192) {
      throw emojiImportError(`dimensi ${entry.id} tidak valid`);
    }
    return { entry, bytes, width, height };
  });
}

export async function materializeEmojiAssets(): Promise<StoredAsset[]> {
  return withLock(MANIFEST_LOCK, () => {
    // Validate the complete server-owned bank before publishing any entries.
    const bank = readEmojiBank();
    const manifest = readAssetManifest();
    const imported: StoredAsset[] = [];
    const createdFiles: string[] = [];
    let changed = false;
    fs.mkdirSync(dirs().assets, { recursive: true });
    try {
      for (const { entry, bytes, width, height } of bank) {
        const name = `Reaksi: ${entry.name}`;
        const hash = entry.sha256.toLowerCase();
        // Codepoints keep the mapping stable when manifest IDs or labels change.
        const mappingId = entry.codepoint.toLowerCase();
        const mapped = Object.values(manifest).filter((asset) => asset.emojiManifestId === mappingId);
        if (mapped.length > 1) throw emojiImportError(`pemetaan ${entry.id} duplikat`);
        const existing = mapped[0] ?? Object.values(manifest).find((asset) => {
          if (asset.kind !== "image" || asset.name !== name || asset.emojiManifestId) return false;
          try {
            return createHash("sha256").update(fs.readFileSync(assetContentPath(asset))).digest("hex") === hash;
          } catch {
            return false;
          }
        });
        if (existing && (existing.kind !== "image" || (existing.emojiSha256 && existing.emojiSha256 !== hash))) {
          throw emojiImportError(`pemetaan ${entry.id} tidak cocok dengan manifest`);
        }
        const id = existing?.id ?? randomUUID();
        const relativePath = existing?.relativePath ?? `${id}.png`;
        const destination = assetPath({ relativePath, id });
        if (fs.existsSync(destination)) {
          const current = fs.readFileSync(assetContentPath(existing as StoredAsset));
          if (createHash("sha256").update(current).digest("hex") !== hash) {
            throw emojiImportError(`konten tersimpan ${entry.id} rusak; tidak ditimpa`);
          }
        } else {
          fs.writeFileSync(destination, bytes, { flag: "wx" });
          createdFiles.push(destination);
        }
        const asset: StoredAsset = existing ?? {
          id,
          kind: "image",
          name,
          filename: relativePath,
          relativePath,
          mimeType: "image/png",
          sizeBytes: bytes.length,
          durationFrames: 0,
          width,
          height,
          hasAudio: false,
          previewReady: true,
          codec: "png",
          frameRate: null,
          proxyRelativePath: null,
          createdAt: new Date().toISOString(),
        };
        const updated = { ...asset, name, emojiManifestId: mappingId, emojiSha256: hash };
        if (!existing || JSON.stringify(existing) !== JSON.stringify(updated)) {
          manifest[id] = updated;
          changed = true;
        }
        imported.push(updated);
      }
      if (changed) writeAssetManifest(manifest);
      return imported;
    } catch (error) {
      for (const file of createdFiles) removeIfExists(file);
      if (error instanceof ApiError) throw error;
      throw new ApiError("DISK_WRITE_FAILED", "Bank emoji lokal gagal disimpan; periksa izin dan ruang disk");
    }
  });
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

  return withLock(MANIFEST_LOCK, () => {
    const manifest = readAssetManifest();
    manifest[id] = asset;
    writeAssetManifest(manifest);
    return asset;
  });
}

export function sanitizeDisplayName(name: string): string {
  const base = (name || "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned.length > 0 ? cleaned : "media").slice(0, 200);
}

export async function createPreviewProxy(asset: StoredAsset): Promise<StoredAsset> {
  if (asset.kind !== "video") return asset;
  const source = assetContentPath(asset);
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
  return withLock(MANIFEST_LOCK, () => {
    const manifest = readAssetManifest();
    if (!manifest[asset.id]) throw new ApiError("ASSET_NOT_FOUND", `Aset ${asset.id} tidak ditemukan`);
    manifest[asset.id] = {
      ...manifest[asset.id],
      relativePath: updated.relativePath,
      filename: updated.filename,
      mimeType: updated.mimeType,
      codec: updated.codec,
      previewReady: updated.previewReady,
      proxyRelativePath: updated.proxyRelativePath,
    };
    writeAssetManifest(manifest);
    return manifest[asset.id];
  });
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
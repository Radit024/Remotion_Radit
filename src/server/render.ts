import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, makeCancelSignal } from "@remotion/renderer";
import type { Edit } from "@/shared/edit";
import { compileEdit } from "@/shared/timeline";
import { dirs } from "./env";
import { ApiError } from "./guard";
import { requireAsset, assetContentPath, readAssetFile } from "./assets";
import { inspectMedia } from "./media";
import { runTool, ToolError } from "./process";
import { probeRenderedOutput } from "./probe";

export type VideoProps = {
  edit: Edit;
  sourceUrl: string;
  assetUrls: Record<string, string>;
};

let cachedBundle: { serveUrl: string; hash: string } | null = null;

export async function ensureBundle(): Promise<string> {
  if (cachedBundle) return cachedBundle.serveUrl;
  const entry = path.join(process.cwd(), "src", "video", "index.ts");
  if (!fs.existsSync(entry)) {
    throw new ApiError("DEPENDENCY_UNAVAILABLE", "Entry composition video tidak ditemukan");
  }
  const serveUrl = await bundle({
    entryPoint: entry,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias || {}),
          "@": path.resolve(process.cwd(), "src"),
        },
      },
    }),
    onProgress: () => {
      /* bundling progress tidak ditampilkan di log */
    },
  });
  cachedBundle = { serveUrl, hash: Date.now().toString() };
  return serveUrl;
}

export function resetBundleCache(): void {
  cachedBundle = null;
}

export function buildInputProps(edit: Edit): VideoProps {
  const asset = requireAsset(edit.assetId);
  const sourcePath = assetContentPath(asset);
  const sourceUrl = pathToUrl(sourcePath);
  const assetUrls: Record<string, string> = {};
  for (const effect of edit.effects) {
    if (effect.assetId && !assetUrls[effect.assetId]) {
      const related = requireAsset(effect.assetId);
      assetUrls[effect.assetId] = pathToUrl(readAssetFile(related));
    }
  }
  return { edit, sourceUrl, assetUrls };
}

function pathToUrl(filePath: string): string {
  if (process.platform === "win32") {
    return `file:///${filePath.replace(/\\/g, "/")}`;
  }
  return `file://${filePath}`;
}

export type RenderOutcome = {
  outputId: string;
  outputPath: string;
  durationFrames: number;
};

export async function renderEdit(
  edit: Edit,
  options: {
    signal: AbortSignal;
    onProgress: (value: number) => void;
  },
): Promise<RenderOutcome> {
  const inputProps = buildInputProps(edit);
  const serveUrl = await ensureBundle();
  const compiled = compileEdit(edit);

  if (compiled.durationFrames <= 0) {
    throw new ApiError("VALIDATION", "Rentang sumber kosong setelah kompilasi");
  }

  const outputId = randomUUID();
  const outputsDir = dirs().outputs;
  fs.mkdirSync(outputsDir, { recursive: true });
  const fileName = `${outputId}.mp4`;
  const tempPath = path.join(dirs().tmp, `${outputId}.partial.mp4`);
  const finalPath = path.join(outputsDir, fileName);

  let composition;
  try {
    composition = await selectComposition({
      serveUrl,
      id: "FunnyMoment",
      inputProps,
    });
  } catch (error) {
    throw new ApiError(
      "RENDER_FAILED",
      `Gagal menyiapkan komposisi: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (options.signal.aborted) {
    throw new ApiError("RENDER_FAILED", "Render dibatalkan");
  }

  const cancelObj = makeCancelSignal();
  const onAbort = () => {
    cancelObj.cancel();
  };
  options.signal.addEventListener("abort", onAbort, { once: true });

  try {
    await renderMedia({
      codec: "h264",
      audioCodec: "aac",
      crf: 18,
      pixelFormat: "yuv420p",
      composition,
      inputProps,
      serveUrl,
      outputLocation: tempPath,
      concurrency: 2,
      chromiumOptions: { gl: "swangle" },
      onProgress: ({ progress }) => {
        options.onProgress(Math.max(0, Math.min(1, progress)));
      },
      cancelSignal: cancelObj.cancelSignal,
    });
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : String(error);
    if (options.signal.aborted) {
      throw new ApiError("RENDER_FAILED", "Render dibatalkan");
    }
    const code = message.includes("ENOSPC") || message.includes("no space")
      ? "DISK_WRITE_FAILED"
      : "RENDER_FAILED";
    throw new ApiError(code, `Render gagal: ${message.slice(0, 300)}`);
  } finally {
    options.signal.removeEventListener("abort", onAbort);
  }

  if (!fs.existsSync(tempPath)) {
    throw new ApiError("RENDER_FAILED", "Render tidak menghasilkan berkas");
  }

  const probe = await probeRenderedOutput(tempPath);
  if (probe.width !== 1080 || probe.height !== 1920) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* ignore */
    }
    throw new ApiError(
      "RENDER_FAILED",
      `Dimensi output tidak sesuai: ${probe.width}x${probe.height}, diharapkan 1080x1920`,
    );
  }

  try {
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    throw new ApiError(
      "DISK_WRITE_FAILED",
      `Gagal memindahkan output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const outputMeta = {
    id: outputId,
    file: fileName,
    projectId: edit.id,
    revision: edit.revision,
    durationFrames: compiled.durationFrames,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputsDir, `${outputId}.json`), `${JSON.stringify(outputMeta, null, 2)}\n`, "utf8");

  return { outputId, outputPath: finalPath, durationFrames: compiled.durationFrames };
}

export async function normalizeSourceForRender(edit: Edit): Promise<string> {
  const asset = requireAsset(edit.assetId);
  const sourcePath = assetContentPath(asset);
  const media = await inspectMedia(sourcePath, "video", fs.statSync(sourcePath).size);
  if (media.codec === "h264") return sourcePath;
  const normalized = path.join(dirs().tmp, `${asset.id}.normalized.mp4`);
  if (fs.existsSync(normalized)) return normalized;
  try {
    await runTool(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourcePath,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        normalized,
      ],
      { timeoutMs: 30 * 60_000 },
    );
  } catch (error) {
    const code = error instanceof ToolError ? "DEPENDENCY_UNAVAILABLE" : "RENDER_FAILED";
    throw new ApiError(code, `Normalisasi sumber gagal: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalized;
}
import { FPS } from "@/shared/edit";
import { runTool, ToolError } from "./process";

export type ProbeStream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  nb_frames?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  pix_fmt?: string;
};

export type ProbeResult = {
  format: {
    filename?: string;
    duration?: string;
    size?: string;
    format_name?: string;
  };
  streams: ProbeStream[];
};

export async function probeMedia(managedPath: string): Promise<ProbeResult> {
  const { stdout } = await runTool(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", managedPath],
    { timeoutMs: 60_000 },
  );
  try {
    return JSON.parse(stdout) as ProbeResult;
  } catch {
    throw new ToolError("MEDIA_UNSUPPORTED", "FFprobe menghasilkan keluaran yang tidak dapat dibaca");
  }
}

export type MediaKind = "video" | "image" | "audio";

export type InspectedMedia = {
  kind: MediaKind;
  codec: string | null;
  width: number;
  height: number;
  durationSeconds: number | null;
  durationFrames: number;
  hasAudio: boolean;
  frameRate: number | null;
};

export class MediaError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "MediaError";
    this.code = code;
    this.status = status;
  }
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [num, den] = value.split("/");
  const numerator = Number(num);
  const denominator = Number(den ?? "1");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const rate = numerator / denominator;
  return rate > 0 && Number.isFinite(rate) ? rate : null;
}

export async function inspectMedia(
  managedPath: string,
  expectedKind: MediaKind,
  sizeBytes: number,
): Promise<InspectedMedia> {
  const probe = await probeMedia(managedPath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const formatDuration = Number(probe.format?.duration);

  if (expectedKind === "image") {
    if (sizeBytes > 25 * 1024 * 1024) {
      throw new MediaError("FILE_TOO_LARGE", 413, "Gambar melebihi batas 25 MiB");
    }
    const width = video?.width ?? 0;
    const height = video?.height ?? 0;
    if (!video) {
      throw new MediaError("MEDIA_UNSUPPORTED", 415, "Berkas tidak dapat dibaca sebagai gambar");
    }
    if (width > 8192 || height > 8192 || width <= 0 || height <= 0) {
      throw new MediaError("MEDIA_UNSUPPORTED", 415, "Dimensi gambar di luar batas yang diizinkan");
    }
    return {
      kind: "image",
      codec: video.codec_name ?? null,
      width,
      height,
      durationSeconds: 0,
      durationFrames: 0,
      hasAudio: false,
      frameRate: null,
    };
  }

  if (expectedKind === "audio") {
    if (sizeBytes > 100 * 1024 * 1024) {
      throw new MediaError("FILE_TOO_LARGE", 413, "Audio melebihi batas 100 MiB");
    }
    if (!audio) {
      throw new MediaError("MEDIA_UNSUPPORTED", 415, "Berkas tidak memiliki aliran audio");
    }
    const duration = Number.isFinite(formatDuration) ? formatDuration : Number(audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new MediaError("MEDIA_UNSUPPORTED", 415, "Durasi audio tidak dapat ditentukan");
    }
    return {
      kind: "audio",
      codec: audio.codec_name ?? null,
      width: 0,
      height: 0,
      durationSeconds: duration,
      durationFrames: Math.max(1, Math.floor(duration * FPS)),
      hasAudio: true,
      frameRate: null,
    };
  }

  if (!video) {
    throw new MediaError("MEDIA_UNSUPPORTED", 415, "Berkas tidak memiliki aliran video");
  }
  if (!Number.isFinite(formatDuration) || formatDuration <= 0) {
    throw new MediaError("MEDIA_UNSUPPORTED", 415, "Durasi video tidak dapat ditentukan");
  }
  const width = video.width ?? 0;
  const height = video.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new MediaError("MEDIA_UNSUPPORTED", 415, "Dimensi video tidak valid");
  }
  const durationFrames = Math.max(1, Math.floor(formatDuration * FPS));
  return {
    kind: "video",
    codec: video.codec_name ?? null,
    width,
    height,
    durationSeconds: formatDuration,
    durationFrames,
    hasAudio: Boolean(audio),
    frameRate: parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate),
  };
}

const BROWSER_SAFE_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);

export function isBrowserPreviewable(media: InspectedMedia): boolean {
  if (media.kind !== "video") return true;
  const codec = media.codec?.toLowerCase() ?? "";
  return BROWSER_SAFE_VIDEO.has(codec);
}

export function needsPreviewProxy(media: InspectedMedia): boolean {
  return media.kind === "video" && !isBrowserPreviewable(media);
}
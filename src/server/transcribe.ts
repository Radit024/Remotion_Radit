import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FPS, type Caption } from "@/shared/edit";
import { dirs, aiConfig } from "./env";
import { ApiError } from "./guard";
import { assetContentPath, requireAsset } from "./assets";
import { runTool, ToolError } from "./process";
import {
  AiError,
  authHeaders,
  fetchWithTimeout,
  mapUpstreamStatus,
  parseUsage,
  readLimitedBody,
  requireApiKey,
  transcriptionUrl,
  type AiUsage,
} from "./openrouter";

void path;

const CHUNK_SECONDS = 30;
const MAX_CHUNKS = 24;

export type TranscriptionChunkInfo = {
  index: number;
  startFrame: number;
  endFrame: number;
};

export type TranscriptionOutcome = {
  captions: Caption[];
  usage: AiUsage | null;
  model: string;
  chunkCount: number;
  segmentsWithoutTimestamps: number;
};

export async function transcribeSelectedRange(
  projectAssetId: string,
  startFrame: number,
  endFrame: number,
  signal: AbortSignal,
): Promise<TranscriptionOutcome> {
  const asset = requireAsset(projectAssetId);
  if (!asset.hasAudio) {
    throw new ApiError("NO_AUDIO", "Sumber tidak memiliki track audio untuk ditranskripsi");
  }
  const apiKey = requireApiKey();
  const config = aiConfig();
  const model = config.transcriptionModel;
  if (!model) {
    throw new ApiError("MODEL_UNSUPPORTED", "OPENROUTER_TRANSCRIPTION_MODEL belum dikonfigurasi");
  }

  const sourcePath = assetContentPath(asset);
  const startSeconds = startFrame / FPS;
  const durationSeconds = (endFrame - startFrame) / FPS;
  const tmpDir = path.join(dirs().tmp, `stt-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const chunkCount = Math.max(1, Math.ceil(durationSeconds / CHUNK_SECONDS));
    if (chunkCount > MAX_CHUNKS) {
      throw new ApiError(
        "VALIDATION",
        `Rentang ${Math.round(durationSeconds)} detik terlalu panjang untuk ${MAX_CHUNKS} chunk speech-to-text`,
      );
    }

    const captions: Caption[] = [];
    let usage: AiUsage | null = null;
    let segmentsWithoutTimestamps = 0;

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunkStart = chunkIndex * CHUNK_SECONDS;
      const chunkDuration = Math.min(CHUNK_SECONDS, durationSeconds - chunkStart);
      if (chunkDuration <= 0) break;

      const wavPath = path.join(tmpDir, `chunk-${chunkIndex}.wav`);
      try {
        await runTool(
          "ffmpeg",
          [
            "-y",
            "-ss",
            String(startSeconds + chunkStart),
            "-t",
            String(chunkDuration),
            "-i",
            sourcePath,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
          "pcm_s16le",
            wavPath,
          ],
          { timeoutMs: 5 * 60_000, signal },
        );
      } catch (error) {
        if (error instanceof ToolError && error.code === "CANCELLED") {
          throw new ApiError("RENDER_FAILED", "Transkripsi dibatalkan");
        }
        throw new ApiError(
          "DEPENDENCY_UNAVAILABLE",
          `FFmpeg gagal mengekstrak audio chunk ${chunkIndex}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const audioBytes = fs.readFileSync(wavPath);
      const payload = {
        model,
        input_audio: { data: audioBytes.toString("base64"), format: "wav" },
        language: config.transcriptionLanguage,
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      };

      const response = await fetchWithTimeout(
        transcriptionUrl(),
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify(payload),
          signal,
        },
        120_000,
      );
      const body = await readLimitedBody(response);
      if (!response.ok) {
        throw mapUpstreamStatus(response.status, body);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new AiError("AI_INVALID_RESPONSE", "Respons speech-to-text bukan JSON yang valid");
      }
      usage = parseUsage(parsed);

      const record = parsed as {
        text?: unknown;
        segments?: unknown;
      };
      const rawSegments = Array.isArray(record.segments) ? record.segments : [];
      if (rawSegments.length === 0) {
        if (typeof record.text === "string" && record.text.trim().length > 0) {
          segmentsWithoutTimestamps += 1;
        }
        continue;
      }

      for (const segment of rawSegments) {
        const parsedSegment = parseSegment(segment, chunkStart, startSeconds);
        if (!parsedSegment) continue;
        captions.push({
          ...parsedSegment,
          id: `ai-${randomUUID().slice(0, 12)}`,
        });
      }
    }

    captions.sort((a, b) => a.startFrame - b.startFrame);
    const deduped = dedupeCaptions(captions);

    return {
      captions: deduped,
      usage,
      model,
      chunkCount,
      segmentsWithoutTimestamps,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function parseSegment(
  raw: unknown,
  chunkOffsetSeconds: number,
  startSeconds: number,
): Caption | null {
  if (!raw || typeof raw !== "object") return null;
  const segment = raw as Record<string, unknown>;
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  const start = typeof segment.start === "number" ? segment.start : Number(segment.start);
  const end = typeof segment.end === "number" ? segment.end : Number(segment.end);
  if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return null;
  }
  const absoluteStart = chunkOffsetSeconds + startSeconds + start;
  const absoluteEnd = chunkOffsetSeconds + startSeconds + end;
  const startFrame = Math.max(0, Math.round(absoluteStart * FPS));
  const endFrame = Math.round(absoluteEnd * FPS);
  if (endFrame <= startFrame) return null;
  return {
    id: `ai-${startFrame}-${Math.round(start * 1000)}`,
    startFrame,
    endFrame,
    text: text.slice(0, 160),
    speaker: null,
  };
}

function dedupeCaptions(captions: Caption[]): Caption[] {
  const result: Caption[] = [];
  for (const caption of captions) {
    const previous = result[result.length - 1];
    if (previous && previous.text === caption.text && caption.startFrame <= previous.endFrame) {
      continue;
    }
    result.push(caption);
  }
  return result;
}
import type { Caption } from "@/shared/edit";
import { ApiError } from "../server/guard";
import { createPreviewProxy, requireAsset } from "../server/assets";
import { setJobRunner, type JobContext, type JobResult } from "../server/jobs";
import { renderEdit } from "../server/render";
import { requestSuggestions } from "../server/suggest";
import { transcribeSelectedRange } from "../server/transcribe";

function snapshotOrThrow(context: JobContext) {
  if (!context.job.snapshot) {
    throw new ApiError("VALIDATION", "Job tidak memiliki snapshot edit");
  }
  return context.job.snapshot;
}

async function runRenderJob(context: JobContext): Promise<JobResult> {
  const edit = snapshotOrThrow(context);
  const outcome = await renderEdit(edit, {
    signal: context.signal,
    onProgress: context.updateProgress,
  });
  return {
    result: {
      outputId: outcome.outputId,
      fileName: `${outcome.outputId}.mp4`,
      durationFrames: outcome.durationFrames,
      projectRelativePath: `outputs/${outcome.outputId}.mp4`,
    },
    outputId: outcome.outputId,
  };
}

async function runProxyJob(context: JobContext): Promise<JobResult> {
  const edit = snapshotOrThrow(context);
  const asset = requireAsset(edit.assetId);
  context.updateProgress(0.1);
  const updated = await createPreviewProxy(asset);
  context.updateProgress(1);
  return {
    result: {
      assetId: updated.id,
      previewReady: updated.previewReady,
      codec: updated.codec,
    },
  };
}

async function runTranscribeJob(context: JobContext): Promise<JobResult> {
  const edit = snapshotOrThrow(context);
  context.updateProgress(0.05);
  const outcome = await transcribeSelectedRange(
    edit.assetId,
    edit.startFrame,
    edit.endFrame,
    context.signal,
  );
  context.updateProgress(1);

  if (outcome.captions.length === 0 && outcome.segmentsWithoutTimestamps > 0) {
    throw new ApiError(
      "TRANSCRIPT_TIMESTAMPS_UNAVAILABLE",
      "Model hanya mengembalikan teks tanpa timestamp. Tambahkan subtitle manual atau gunakan model lain.",
    );
  }

  const existing = new Set(edit.captions.map((caption) => `${caption.startFrame}:${caption.text}`));
  const additions: Caption[] = outcome.captions
    .filter((caption) => !existing.has(`${caption.startFrame}:${caption.text}`))
    .map((caption) => ({ ...caption, speaker: null }));

  return {
    result: {
      captions: additions,
      proposalOnly: true,
      model: outcome.model,
      usage: outcome.usage,
      chunkCount: outcome.chunkCount,
    },
  };
}

async function runSuggestionsJob(context: JobContext): Promise<JobResult> {
  const edit = snapshotOrThrow(context);
  context.updateProgress(0.1);
  const outcome = await requestSuggestions(edit, { signal: context.signal });
  context.updateProgress(1);
  return {
    result: {
      suggestions: outcome.suggestions,
      model: outcome.model,
      usage: outcome.usage,
    },
  };
}

export const jobRunner = async (context: JobContext): Promise<JobResult> => {
  switch (context.job.kind) {
    case "render":
      return runRenderJob(context);
    case "proxy":
      return runProxyJob(context);
    case "transcribe":
      return runTranscribeJob(context);
    case "suggestions":
      return runSuggestionsJob(context);
    default:
      throw new ApiError("VALIDATION", `Jenis job tidak dikenal: ${String(context.job.kind)}`);
  }
};

setJobRunner(jobRunner);
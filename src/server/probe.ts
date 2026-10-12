import { probeMedia } from "./media";

export type RenderProbe = {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec: string | null;
  audioCodec: string | null;
  frameRate: number | null;
};

export async function probeRenderedOutput(filePath: string): Promise<RenderProbe> {
  const probe = await probeMedia(filePath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration ?? video?.duration ?? 0);
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    frameRate: null,
  };
}
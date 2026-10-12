import { z } from "zod";

export const FPS = 30;

export const CANVAS = { width: 1080, height: 1920 } as const;
export const SAFE_AREA = { left: 80, right: 180, top: 160, bottom: 320 } as const;

export const LIMITS = {
  nameMax: 120,
  captionMax: 160,
  reactionMax: 80,
  reasonMax: 240,
  speakerMax: 40,
  captionsMax: 600,
  effectsMax: 100,
  freezeMax: 60,
  replayMax: 90,
  zoomMin: 1,
  zoomMax: 1.5,
  shakeMax: 12,
  captionYMin: 0.15,
  captionYMax: 0.82,
};

export const PRESETS = ["light", "meme"] as const;
export type Preset = (typeof PRESETS)[number];

export const LAYOUTS = ["contain", "crop"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const toFrame = (seconds: number): number => Math.round(seconds * FPS);
export const toSeconds = (frames: number): number => frames / FPS;
export const formatTimecode = (frames: number): string => {
  const total = Math.max(0, Math.round(frames));
  const secondsPart = Math.floor(total / FPS);
  const framePart = total % FPS;
  const minutes = Math.floor(secondsPart / 60);
  const seconds = secondsPart % 60;
  const hundredths = Math.round((framePart / FPS) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};
export const parseTimecode = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[3];
  let seconds = 0;
  if (fraction) {
    const asMillis = fraction.length === 3;
    const scaled = asMillis ? Number(fraction) / 1000 : Number(fraction) / 100;
    seconds = scaled;
  }
  const total = Math.round((Number(match[1]) * 60 + Number(match[2]) + seconds) * FPS);
  const rounded = total;
  return Number.isFinite(rounded) ? rounded : null;
};

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const assetSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(["video", "image", "audio"]),
  name: z.string().min(1).max(200),
  durationFrames: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  hasAudio: z.boolean(),
  previewReady: z.boolean(),
});
export type Asset = z.infer<typeof assetSchema>;

export const captionSchema = z.strictObject({
  id: idSchema,
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  text: z.string().min(1).max(LIMITS.captionMax),
  speaker: z.union([z.string().max(LIMITS.speakerMax), z.null()]).default(null),
});

export const effectSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(["zoom", "shake", "reaction", "image", "sfx"]),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  text: z.string().max(LIMITS.reactionMax).default(""),
  assetId: z.union([idSchema, z.null()]).default(null),
  strength: z.number().min(0).max(LIMITS.zoomMax),
});

export const editSchema = z.strictObject({
  id: idSchema,
  revision: z.number().int().positive(),
  assetId: idSchema,
  name: z.string().min(1).max(LIMITS.nameMax),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  momentFrame: z.number().int().nonnegative(),
  preset: z.enum(PRESETS),
  layout: z.enum(LAYOUTS),
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
  captionY: z.number().min(LIMITS.captionYMin).max(LIMITS.captionYMax),
  freezeFrames: z.number().int().min(0).max(LIMITS.freezeMax),
  replayFrames: z.number().int().min(0).max(LIMITS.replayMax),
  captions: z.array(captionSchema).max(LIMITS.captionsMax),
  effects: z.array(effectSchema).max(LIMITS.effectsMax),
});

export type Caption = z.infer<typeof captionSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Edit = z.infer<typeof editSchema>;

export class ValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Edit tidak valid: ${issues.join("; ")}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export type DraftOverrides = Partial<Omit<Edit, "id" | "assetId">>;

export function makeDefaultEdit(
  id: string,
  asset: Asset,
  overrides: DraftOverrides = {},
): Edit {
  const startFrame = overrides.startFrame ?? 0;
  const endFrame = overrides.endFrame ?? asset.durationFrames;
  return editSchema.parse({
    id,
    revision: 1,
    assetId: asset.id,
    name: overrides.name ?? asset.name,
    startFrame,
    endFrame,
    momentFrame: overrides.momentFrame ?? startFrame + Math.floor((endFrame - startFrame) / 2),
    preset: overrides.preset ?? "light",
    layout: overrides.layout ?? "contain",
    focusX: overrides.focusX ?? 0.5,
    focusY: overrides.focusY ?? 0.5,
    captionY: overrides.captionY ?? 0.72,
    freezeFrames: overrides.freezeFrames ?? 0,
    replayFrames: overrides.replayFrames ?? 0,
    captions: overrides.captions ?? [],
    effects: overrides.effects ?? [],
  });
}

export function validateEdit(
  edit: unknown,
  asset: Asset,
  relatedAssets: Asset[] = [],
): Edit {
  const parsed = editSchema.safeParse(edit);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "edit"}: ${issue.message}`),
    );
  }
  const value = parsed.data;
  const issues: string[] = [];

  if (value.assetId !== asset.id) {
    issues.push(`assetId harus merujuk ${asset.id}`);
  }
  if (asset.kind !== "video") {
    issues.push("sumber harus berupa video");
  }
  if (value.startFrame >= value.endFrame) {
    issues.push(`startFrame ${value.startFrame} harus < endFrame ${value.endFrame}`);
  }
  if (value.endFrame > asset.durationFrames) {
    issues.push(
      `endFrame ${value.endFrame} melewati durasi media ${asset.durationFrames} frame`,
    );
  }
  if (value.momentFrame < value.startFrame || value.momentFrame >= value.endFrame) {
    issues.push(
      `momentFrame ${value.momentFrame} harus berada di dalam rentang [${value.startFrame}, ${value.endFrame})`,
    );
  }

  const sorted = value.captions
    .map((caption, index) => ({ caption, index }))
    .sort((a, b) => a.caption.startFrame - b.caption.startFrame);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].caption.startFrame < sorted[i - 1].caption.endFrame) {
      issues.push(
        `caption ${sorted[i].caption.id} tumpang tindih dengan ${sorted[i - 1].caption.id}`,
      );
    }
  }

  const byId = new Map(relatedAssets.map((item) => [item.id, item]));
  for (const effect of value.effects) {
    if (effect.startFrame >= effect.endFrame) {
      issues.push(`effect ${effect.id}: startFrame harus < endFrame`);
    }
    if (effect.kind === "image" || effect.kind === "sfx") {
      if (!effect.assetId) {
        issues.push(`effect ${effect.id} butuh assetId untuk ${effect.kind}`);
      } else {
        const related = byId.get(effect.assetId);
        if (!related) {
          issues.push(`effect ${effect.id} memakai aset ${effect.assetId} yang tidak ada`);
        } else if (related.kind === "video") {
          issues.push(`effect ${effect.id} tidak boleh memakai aset video`);
        }
      }
    } else if (effect.assetId) {
      issues.push(`effect ${effect.id} jenis ${effect.kind} tidak boleh memakai assetId`);
    }
    if (effect.kind === "reaction" && effect.text.length === 0) {
      issues.push(`effect ${effect.id} reaksi butuh teks`);
    }
    if (effect.kind === "zoom") {
      if (effect.strength < LIMITS.zoomMin || effect.strength > LIMITS.zoomMax) {
        issues.push(`effect ${effect.id} zoom harus 1..1.5`);
      }
    }
    if (effect.kind === "shake" && effect.strength > LIMITS.shakeMax) {
      issues.push(`effect ${effect.id} shake maksimum ${LIMITS.shakeMax} px`);
    }
  }

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }
  return value;
}

export function clipCaptionsToRange(edit: Edit): { captions: Caption[]; clipped: number } {
  const kept: Caption[] = [];
  let clipped = 0;
  for (const caption of edit.captions) {
    const startFrame = Math.max(caption.startFrame, edit.startFrame);
    const endFrame = Math.min(caption.endFrame, edit.endFrame);
    if (startFrame < endFrame) {
      kept.push({ ...caption, startFrame, endFrame });
    } else {
      clipped += 1;
    }
  }
  return { captions: kept, clipped };
}

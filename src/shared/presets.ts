import type { Edit, Preset } from "./edit";
import { LIMITS } from "./edit";

export type PresetEffectSpec = {
  kind: "zoom" | "shake" | "freeze" | "replay";
  value: number;
  windowFrames: number;
  enabled: boolean;
};

export const PRESET_DEFAULTS: Record<Preset, { effects: PresetEffectSpec[]; description: string }> = {
  light: {
    description: "Zoom halus 1.12× selama 18 frame di sekitar titik momen.",
    effects: [
      { kind: "zoom", value: 1.12, windowFrames: 18, enabled: true },
      { kind: "shake", value: 0, windowFrames: 0, enabled: false },
      { kind: "freeze", value: 0, windowFrames: 0, enabled: false },
      { kind: "replay", value: 0, windowFrames: 0, enabled: false },
    ],
  },
  meme: {
    description: "Zoom 1.30× 24 frame, shake 8 px, freeze 12 frame; replay opsional.",
    effects: [
      { kind: "zoom", value: 1.3, windowFrames: 24, enabled: true },
      { kind: "shake", value: 8, windowFrames: 10, enabled: true },
      { kind: "freeze", value: 12, windowFrames: 12, enabled: true },
      { kind: "replay", value: 3.3333333, windowFrames: 36, enabled: false },
    ],
  },
};

export function makePresetEffects(
  preset: Preset,
  momentFrame: number,
  startFrame: number,
  endFrame: number,
): Edit["effects"] {
  const spec = PRESET_DEFAULTS[preset].effects.filter((item) => item.enabled);
  const effects: Edit["effects"] = [];
  for (const item of spec) {
    if (item.windowFrames <= 0) continue;
    const half = Math.floor(item.windowFrames / 2);
    const startFrameRaw = momentFrame - half;
    const endFrameRaw = startFrameRaw + item.windowFrames;
    const clippedStart = Math.max(startFrame, startFrameRaw);
    const clippedEnd = Math.min(endFrame, endFrameRaw);
    if (clippedStart >= clippedEnd) continue;
    if (item.kind === "zoom") {
      effects.push({
        id: `zoom-${momentFrame}`,
        kind: "zoom",
        startFrame: clippedStart,
        endFrame: clippedEnd,
        text: "",
        assetId: null,
        strength: item.value,
      });
    }
    if (item.kind === "shake") {
      effects.push({
        id: `shake-${momentFrame}`,
        kind: "shake",
        startFrame: clippedStart,
        endFrame: clippedEnd,
        text: "",
        assetId: null,
        strength: Math.min(LIMITS.shakeMax, item.value),
      });
    }
  }
  return effects;
}

export function applyPresetDefaults(edit: Edit, preset: Preset): Edit {
  const effects = makePresetEffects(preset, edit.momentFrame, edit.startFrame, edit.endFrame);
  return {
    ...edit,
    preset,
    freezeFrames: preset === "meme" ? 12 : 0,
    replayFrames: edit.replayFrames > 0 && preset === "meme" ? edit.replayFrames : 0,
    effects,
  };
}

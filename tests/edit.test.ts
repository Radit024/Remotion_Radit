import { expect, test } from "vitest";
import { validateEdit, editSchema, effectSchema, LIMITS, toFrame, toSeconds, formatTimecode, parseTimecode, type Asset, type Edit } from "../src/shared/edit";
import { applyPresetDefaults, makePresetEffects } from "../src/shared/presets";

const asset: Asset = {
  id: "a",
  kind: "video",
  name: "clip.mp4",
  durationFrames: 7560,
  width: 1920,
  height: 1080,
  hasAudio: true,
  previewReady: true,
};
const edit: Edit = {
  id: "p",
  revision: 1,
  assetId: "a",
  name: "Mabar",
  startFrame: 2400,
  endFrame: 3300,
  momentFrame: 2952,
  preset: "light",
  layout: "contain",
  focusX: 0.5,
  focusY: 0.5,
  captionY: 0.72,
  freezeFrames: 0,
  replayFrames: 0,
  captions: [],
  effects: [],
};

test("accepts selected range within a 4m12s source", () => {
  expect(validateEdit(edit, asset, []).endFrame).toBe(3300);
});

test.each([NaN, Infinity, -1, 3300])("rejects invalid moment %s", (momentFrame) => {
  expect(() => validateEdit({ ...edit, momentFrame }, asset, [])).toThrow();
});

test("rejects nonexistent meme asset", () => {
  expect(() =>
    validateEdit(
      {
        ...edit,
        effects: [
          { id: "e", kind: "image", startFrame: 2952, endFrame: 2982, text: "", assetId: "missing", strength: 1 },
        ],
      },
      asset,
      [],
    ),
  ).toThrow();
});

test("rejects caption overlap and start>=end", () => {
  const captions = [
    { id: "c1", startFrame: 100, endFrame: 120, text: "satu", speaker: null },
    { id: "c2", startFrame: 110, endFrame: 130, text: "dua", speaker: null },
    { id: "c3", startFrame: 140, endFrame: 140, text: "nol", speaker: null },
  ];
  expect(() => validateEdit({ ...edit, captions }, asset, [])).toThrow();
});

test("rejects out of bounds numeric fields and unknown keys", () => {
  expect(() => validateEdit({ ...edit, focusX: 1.2 }, asset, [])).toThrow();
  expect(() => validateEdit({ ...edit, captionY: 0.1 }, asset, [])).toThrow();
  expect(() => validateEdit({ ...edit, freezeFrames: 61 }, asset, [])).toThrow();
  expect(() => validateEdit({ ...edit, replayFrames: 91 }, asset, [])).toThrow();
  expect(() => validateEdit({ ...edit, nope: true }, asset, [])).toThrow();
  expect(() => validateEdit({ ...edit, endFrame: 9999 }, asset, [])).toThrow();
});

test("accepts reaction only with text and known image asset", () => {
  const result = validateEdit(
    {
      ...edit,
      effects: [
        { id: "r", kind: "reaction", startFrame: 2952, endFrame: 2970, text: "gila", assetId: null, strength: 1 },
        {
          id: "m",
          kind: "image",
          startFrame: 2952,
          endFrame: 2970,
          text: "",
          assetId: "mem",
          strength: 1,
        },
      ],
    },
    asset,
    [{ id: "mem", kind: "image", name: "meme.png", durationFrames: 0, width: 800, height: 800, hasAudio: false, previewReady: true }],
  );
  expect(result.effects).toHaveLength(2);
});

test("rejects reaction without text and audio kind on sfx-less effect", () => {
  expect(() =>
    validateEdit(
      { ...edit, effects: [{ id: "r", kind: "reaction", startFrame: 2952, endFrame: 2970, text: "", assetId: null, strength: 1 }] },
      asset,
      [],
    ),
  ).toThrow();
});

test("timecode helpers round-trip", async () => {
  const { formatTimecode, parseTimecode, toFrame } = await import("../src/shared/edit");
  expect(toFrame(98.4)).toBe(2952);
  expect(formatTimecode(2952)).toBe("01:38.40");
  expect(parseTimecode("01:38.400")).toBe(2952);
  expect(parseTimecode("bogus")).toBeNaN();
});

test.each(["00:00.5", "00:00.50", "00:00.500", "00:00,5"])("fraction %s means half a second", (value) => {
  expect(parseTimecode(value)).toBe(15);
});

test.each(["01:60.00", "01:99", "", "01:", "-01:02", "0:3", "bogus", "NaN", "00:01.5000", "999999999999999999999:00"])("invalid timecode %s is NaN, never frame zero", (value) => {
  expect(parseTimecode(value)).toBeNaN();
});

test("timecode uses canonical integer frames including minute boundaries and long sources", () => {
  expect(toFrame(80)).toBe(2400);
  expect(toFrame(98.4)).toBe(2952);
  expect(toSeconds(2952)).toBe(98.4);
  expect(parseTimecode("01:20")).toBe(2400);
  expect(parseTimecode("01:38,4")).toBe(2952);
  expect(parseTimecode("120:00.00")).toBe(216000);
  for (let frame = 0; frame < 7560; frame += 1) {
    expect(parseTimecode(formatTimecode(frame))).toBe(frame);
  }
  expect(formatTimecode(NaN)).toBe("--:--.--");
});

test("Light to Meme to Light replaces only generated preset effects", () => {
  const custom: Edit["effects"] = [
    { id: "sticker", kind: "image", startFrame: 2952, endFrame: 2997, text: "", assetId: "mem", strength: 1 },
    { id: "sound", kind: "sfx", startFrame: 2952, endFrame: 3000, text: "", assetId: "audio", strength: 1 },
    { id: "reaction", kind: "reaction", startFrame: 2952, endFrame: 3000, text: "WOW", assetId: null, strength: 1 },
    { id: "my-zoom", kind: "zoom", startFrame: 2952, endFrame: 3000, text: "", assetId: null, strength: 1.2 },
    { id: "my-shake", kind: "shake", startFrame: 2952, endFrame: 3000, text: "", assetId: null, strength: 1 },
    { id: "zoom-2952-custom", kind: "zoom", startFrame: 2952, endFrame: 3000, text: "", assetId: null, strength: 1.2 },
    { id: "shake-123", kind: "reaction", startFrame: 2952, endFrame: 3000, text: "Not generated", assetId: null, strength: 1 },
  ];
  const original = { ...edit, replayFrames: 36, effects: [...custom, ...makePresetEffects("light", 2952, 2400, 3300)] };
  const meme = applyPresetDefaults(original, "meme");
  expect(meme.effects.slice(0, custom.length)).toEqual(custom);
  expect(meme.freezeFrames).toBe(12);
  expect(meme.replayFrames).toBe(36);
  expect(meme.effects.filter((effect) => effect.kind === "zoom" && effect.id === "zoom-2952")).toHaveLength(1);
  const light = applyPresetDefaults(meme, "light");
  expect(light.effects.slice(0, custom.length)).toEqual(custom);
  expect(light.effects).toHaveLength(custom.length + 1);
  expect(light.freezeFrames).toBe(0);
  expect(light.replayFrames).toBe(0);
  expect(original.effects).toHaveLength(custom.length + 1);
});

test("preset change removes generated effects from an old moment without losing custom effects", () => {
  const oldGenerated = makePresetEffects("meme", 2900, 2400, 3300);
  const result = applyPresetDefaults({ ...edit, effects: oldGenerated }, "light");
  expect(result.effects.map((effect) => effect.id)).toEqual(["zoom-2952"]);
});

test("generated Meme effects validate with shake strength 8 and survive an actual project save", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const { dirs, ensureDataDirs } = await import("../src/server/env");
  const { readAssetManifest, writeAssetManifest } = await import("../src/server/assets");
  const { createProject, saveProject, readProject } = await import("../src/server/projects");
  ensureDataDirs();
  const id = randomUUID();
  const fixture = {
    ...asset, id, filename: `${id}.mp4`, relativePath: `${id}.mp4`, mimeType: "video/mp4",
    sizeBytes: 13, codec: "h264", frameRate: 30, proxyRelativePath: null, createdAt: new Date().toISOString(),
  };
  writeAssetManifest({ ...readAssetManifest(), [id]: fixture });
  fs.writeFileSync(path.join(dirs().assets, fixture.relativePath), "fixture-video");
  const project = createProject(id, "Meme preset save regression");
  const draft = applyPresetDefaults({ ...project, startFrame: 2400, endFrame: 3300, momentFrame: 2952 }, "meme");
  const canonicalDraft = editSchema.strip().parse(draft);
  expect(validateEdit(canonicalDraft, fixture).effects.find((effect) => effect.kind === "shake")?.strength).toBe(8);
  const saved = await saveProject(project.id, draft, 1);
  expect(saved).toMatchObject({ preset: "meme", freezeFrames: 12, revision: 2 });
  expect(readProject(project.id).effects).toEqual(draft.effects);
});

test.each([
  ["zoom", 1, 1.5], ["shake", 0, 12], ["reaction", 0, 1.5], ["image", 0, 1.5], ["sfx", 0, 1.5],
] as const)("effect schema enforces %s-specific strength bounds %s..%s", (kind, min, max) => {
  const effect = { id: "strength", kind, startFrame: 2952, endFrame: 3000, text: "WOW", assetId: null };
  expect(effectSchema.safeParse({ ...effect, strength: min }).success).toBe(true);
  expect(effectSchema.safeParse({ ...effect, strength: max }).success).toBe(true);
  expect(effectSchema.safeParse({ ...effect, strength: min - 0.01 }).success).toBe(false);
  expect(effectSchema.safeParse({ ...effect, strength: max + 0.01 }).success).toBe(false);
  expect(effectSchema.safeParse({ ...effect, strength: NaN }).success).toBe(false);
  expect(effectSchema.safeParse({ ...effect, strength: Infinity }).success).toBe(false);
});

test("preset limit rejects overflow atomically, preserving all 100 custom effects", () => {
  const custom: Edit["effects"] = Array.from({ length: LIMITS.effectsMax }, (_, index) => ({
    id: `custom-${index}`, kind: "reaction", startFrame: 2952, endFrame: 3000, text: `Custom ${index}`, assetId: null, strength: 1,
  }));
  const original = { ...edit, effects: custom };
  expect(() => applyPresetDefaults(original, "light")).toThrow(/100/);
  expect(() => applyPresetDefaults(original, "meme")).toThrow(/100/);
  expect(original.effects).toEqual(custom);
  expect(original.preset).toBe("light");
});

test("preset replacement accepts the exact 100-effect boundary without double counting old generated effects", () => {
  const custom: Edit["effects"] = Array.from({ length: 98 }, (_, index) => ({
    id: `custom-${index}`, kind: "reaction", startFrame: 2952, endFrame: 3000, text: `Custom ${index}`, assetId: null, strength: 1,
  }));
  const meme = applyPresetDefaults({ ...edit, effects: [...custom, ...makePresetEffects("meme", 2900, 2400, 3300)] }, "meme");
  expect(meme.effects).toHaveLength(100);
  expect(meme.effects.slice(0, 98)).toEqual(custom);
  expect(validateEdit(meme, asset).effects).toHaveLength(100);
  const light = applyPresetDefaults(meme, "light");
  expect(light.effects).toHaveLength(99);
  expect(light.effects.slice(0, 98)).toEqual(custom);
});

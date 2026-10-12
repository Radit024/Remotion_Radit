import { expect, test } from "vitest";
import { validateEdit, type Asset, type Edit } from "../src/shared/edit";

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
  expect(parseTimecode("bogus")).toBeNull();
});

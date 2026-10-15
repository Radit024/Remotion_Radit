import { expect, test } from "vitest";
import { compileEdit, sourceFrameAt, outputFrameAt, buildSegments } from "../src/shared/timeline";
import type { Edit } from "../src/shared/edit";

const edit: Edit = {
  id: "p",
  revision: 1,
  assetId: "a",
  name: "x",
  startFrame: 2400,
  endFrame: 3300,
  momentFrame: 2952,
  preset: "meme",
  layout: "contain",
  focusX: 0.5,
  focusY: 0.5,
  captionY: 0.72,
  freezeFrames: 12,
  replayFrames: 36,
  effects: [],
  captions: [{ id: "c", startFrame: 2952, endFrame: 2960, text: "jatuh", speaker: null }],
};

test("freeze/replay preserve selected source length and align captions", () => {
  const result = compileEdit(edit);
  expect(result.durationFrames).toBe(948);
  expect(sourceFrameAt(result, 552)).toBe(2952);
  expect(sourceFrameAt(result, 563)).toBe(2952);
  expect(sourceFrameAt(result, 564)).toBe(2952);
  expect(result.captions.some((c) => c.startFrame === 564)).toBe(true);
  expect(sourceFrameAt(result, 947)).toBe(3299);
});

test("no insertions maps first/last frame exactly", () => {
  const r = compileEdit({ ...edit, freezeFrames: 0, replayFrames: 0 });
  expect(r.durationFrames).toBe(900);
  expect(sourceFrameAt(r, 0)).toBe(2400);
  expect(sourceFrameAt(r, 899)).toBe(3299);
});

test("moment at start with replay still schedules the event frame", () => {
  const r = buildSegments(100, 200, 100, 0, 30);
  expect(r.segments[0]).toEqual({
    kind: "normal",
    sourceStart: 100,
    sourceEnd: 130,
    outputStart: 0,
    durationFrames: 30,
  });
  expect(r.segments[1].kind).toBe("replay");
  expect(r.segments[1].sourceStart).toBe(100);
  expect(r.segments[1].sourceEnd).toBe(130);
  expect(r.durationFrames).toBe(100 + 30);
  const compiled = compileEdit({
    ...edit,
    startFrame: 100,
    endFrame: 200,
    momentFrame: 100,
    freezeFrames: 0,
    replayFrames: 30,
    effects: [],
    captions: [],
  });
  expect(sourceFrameAt(compiled, 0)).toBe(100);
  expect(sourceFrameAt(compiled, 29)).toBe(129);
  expect(sourceFrameAt(compiled, 30)).toBe(100);
  expect(sourceFrameAt(compiled, 59)).toBe(129);
  expect(sourceFrameAt(compiled, 60)).toBe(130);
  expect(sourceFrameAt(compiled, 129)).toBe(199);
});

test("replay shorter near end keeps continuity and caption window", () => {
  const r = compileEdit({
    ...edit,
    startFrame: 2400,
    endFrame: 3300,
    momentFrame: 3298,
    freezeFrames: 12,
    replayFrames: 36,
    captions: [
      { id: "c1", startFrame: 2400, endFrame: 2410, text: "awal", speaker: null },
      { id: "c2", startFrame: 3270, endFrame: 3300, text: "akhir", speaker: null },
    ],
    effects: [],
  });
  let previousEnd = 0;
  for (const segment of r.segments) {
    expect(segment.outputStart).toBe(previousEnd);
    previousEnd += segment.durationFrames;
  }
  expect(previousEnd).toBe(r.durationFrames);
  expect(r.captions.filter((c) => c.id === "c2").length).toBeGreaterThanOrEqual(1);
});

test("captions crossing a freeze are duplicated across the insertion", () => {
  const r = compileEdit({
    ...edit,
    freezeFrames: 10,
    replayFrames: 0,
    captions: [{ id: "c", startFrame: 2948, endFrame: 2958, text: "menyeberang", speaker: null }],
    effects: [],
  });
  expect(r.captions.filter((c) => c.segmentIndex === 0).length).toBe(1);
  expect(r.captions.filter((c) => c.segmentIndex === 1).length).toBe(1);
  expect(r.durationFrames).toBe(910);
});

test("out of range output frame throws", () => {
  const r = compileEdit(edit);
  expect(() => sourceFrameAt(r, -1)).toThrow();
  expect(() => sourceFrameAt(r, r.durationFrames)).toThrow();
  expect(() => sourceFrameAt(r, 1.5)).toThrow();
});

test("source moment marker maps to its first normal occurrence with freeze and replay", () => {
  const compiled = compileEdit(edit);
  const outputMoment = outputFrameAt(compiled, edit.momentFrame);
  expect(outputMoment).toBe(564);
  expect(sourceFrameAt(compiled, outputMoment!)).toBe(edit.momentFrame);
  const replay = compiled.segments.find((segment) => segment.kind === "replay")!;
  expect(sourceFrameAt(compiled, replay.outputStart + edit.momentFrame - replay.sourceStart)).toBe(edit.momentFrame);
  expect(outputFrameAt(compiled, edit.endFrame)).toBeNull();
});

test("compiled subtitle and effect track windows stay aligned to source through insertions", () => {
  const compiled = compileEdit({ ...edit, effects: [
    { id: "image", kind: "image", startFrame: 2952, endFrame: 2997, text: "", assetId: "sticker", strength: 1 },
  ] });
  for (const effect of compiled.effects) {
    expect(sourceFrameAt(compiled, effect.startFrame)).toBeGreaterThanOrEqual(2952);
    expect(sourceFrameAt(compiled, effect.startFrame)).toBeLessThan(2997);
    expect(effect.endFrame).toBeLessThanOrEqual(compiled.durationFrames);
  }
  expect(compiled.effects.some((effect) => compiled.segments[effect.segmentIndex].kind === "replay")).toBe(true);
});

test("source-active image, reaction and subtitle ranges cover every frozen output frame", () => {
  const compiled = compileEdit({ ...edit,
    captions: [{ id: "caption", startFrame: 2952, endFrame: 2953, text: "Freeze cue", speaker: null }],
    effects: [
      { id: "image", kind: "image", startFrame: 2952, endFrame: 2953, text: "", assetId: "sticker", strength: 1 },
      { id: "reaction", kind: "reaction", startFrame: 2952, endFrame: 2953, text: "WOW", assetId: null, strength: 1 },
      { id: "ended", kind: "image", startFrame: 2951, endFrame: 2952, text: "", assetId: "sticker", strength: 1 },
      { id: "later", kind: "image", startFrame: 2953, endFrame: 2954, text: "", assetId: "sticker", strength: 1 },
    ],
  });
  const freezeIndex = compiled.segments.findIndex((segment) => segment.kind === "freeze");
  const freeze = compiled.segments[freezeIndex];
  expect(compiled.effects.filter((effect) => effect.segmentIndex === freezeIndex).map((effect) => effect.id)).toEqual(["image", "reaction"]);
  for (let frame = freeze.outputStart; frame < freeze.outputStart + freeze.durationFrames; frame += 1) {
    expect(sourceFrameAt(compiled, frame)).toBe(2952);
    expect(compiled.effects.filter((effect) => effect.startFrame <= frame && frame < effect.endFrame).map((effect) => effect.id)).toEqual(["image", "reaction"]);
    expect(compiled.captions.some((caption) => caption.startFrame <= frame && frame < caption.endFrame)).toBe(true);
  }
  expect(compiled.durationFrames).toBe(948);
});

test("SFX fragment offsets are relative to the original effect, including trim, replay and post-replay continuation", () => {
  const compiled = compileEdit({ ...edit, effects: [
    { id: "sound", kind: "sfx", startFrame: 2390, endFrame: 3300, text: "", assetId: "audio", strength: 1 },
    { id: "at-moment", kind: "sfx", startFrame: 2952, endFrame: 3000, text: "", assetId: "audio", strength: 1 },
  ] });
  for (const effect of compiled.effects) {
    const originalStart = effect.id === "sound" ? 2390 : 2952;
    expect(effect.sourceStartOffset).toBe(sourceFrameAt(compiled, effect.startFrame) - originalStart);
  }
  const sound = compiled.effects.filter((effect) => effect.id === "sound");
  expect(sound.map((effect) => effect.sourceStartOffset)).toEqual([10, 562, 562, 550, 586]);
  const moment = compiled.effects.filter((effect) => effect.id === "at-moment");
  expect(moment.map((effect) => effect.sourceStartOffset)).toEqual([0, 0, 0, 24]);
  const replayIndex = compiled.segments.findIndex((segment) => segment.kind === "replay");
  expect(sound.find((effect) => effect.segmentIndex === replayIndex)?.sourceStartOffset).toBe(550);
});

test("normal and replay visual ranges match the exact source/output mapping without changing segment compilation", () => {
  const events: Edit["effects"] = [
    { id: "before", kind: "image", startFrame: 2940, endFrame: 2952, text: "", assetId: "sticker", strength: 1 },
    { id: "crossing", kind: "reaction", startFrame: 2948, endFrame: 2960, text: "WOW", assetId: null, strength: 1 },
    { id: "after", kind: "image", startFrame: 2970, endFrame: 3000, text: "", assetId: "sticker", strength: 1 },
  ];
  const compiled = compileEdit({ ...edit, effects: events });
  const baseline = compileEdit(edit);
  expect(compiled.segments).toEqual(baseline.segments);
  expect(compiled.durationFrames).toBe(baseline.durationFrames);
  for (let output = 0; output < compiled.durationFrames; output += 1) {
    const source = sourceFrameAt(compiled, output);
    const expected = events.filter((effect) => effect.startFrame <= source && source < effect.endFrame).map((effect) => effect.id).sort();
    const actual = compiled.effects.filter((effect) => effect.startFrame <= output && output < effect.endFrame).map((effect) => effect.id).sort();
    expect(actual).toEqual(expected);
    expect(sourceFrameAt(compiled, output)).toBe(sourceFrameAt(baseline, output));
  }
});

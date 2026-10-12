import { expect, test } from "vitest";
import { compileEdit, sourceFrameAt, buildSegments } from "../src/shared/timeline";
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

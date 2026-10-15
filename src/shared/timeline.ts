import type { Caption, Edit, Effect } from "./edit";

export type SegmentKind = "normal" | "freeze" | "replay";

export type Segment = {
  kind: SegmentKind;
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  durationFrames: number;
};

export type CompiledEdit = {
  segments: Segment[];
  durationFrames: number;
  captions: CompiledCaption[];
  effects: CompiledEffect[];
};

export type CompiledCaption = Caption & { segmentIndex: number };

export type CompiledEffect = Effect & {
  segmentIndex: number;
  /** Frames from the original effect's source start to this fragment's source start. */
  sourceStartOffset: number;
};

export type BuildParams = {
  startFrame: number;
  endFrame: number;
  momentFrame: number;
  freezeFrames: number;
  replayFrames: number;
};

export function buildSegments(
  s: number,
  e: number,
  p: number,
  f: number,
  r: number,
): { segments: Segment[]; durationFrames: number } {
  const list: Segment[] = [];
  let output = 0;
  const add = (kind: SegmentKind, a: number, b: number, length = b - a) => {
    if (length <= 0) return;
    list.push({
      kind,
      sourceStart: a,
      sourceEnd: b,
      outputStart: output,
      durationFrames: length,
    });
    output += length;
  };
  const a = Math.max(s, p - Math.floor(r / 3));
  const b = Math.min(e, a + r);
  add("normal", s, p);
  add("freeze", p, p + 1, f);
  add("normal", p, Math.max(p, b));
  if (r > 0) add("replay", a, b);
  add("normal", Math.max(p, b), e);
  return { segments: list, durationFrames: output };
}

function clipToSegments(
  events: Array<{ id: string; startFrame: number; endFrame: number }>,
  segments: Segment[],
): Array<{ id: string; startFrame: number; endFrame: number; segmentIndex: number; offset: number }> {
  const result: Array<{ id: string; startFrame: number; endFrame: number; segmentIndex: number; offset: number }> = [];
  segments.forEach((segment, index) => {
    const segStart = segment.sourceStart;
    const segEnd = segment.kind === "freeze" ? segment.sourceStart + 1 : segment.sourceEnd;
    for (const event of events) {
      const start = Math.max(event.startFrame, segStart);
      const end = Math.min(event.endFrame, segEnd);
      if (start >= end) continue;
      result.push({
        id: event.id,
        // The held source frame is active for the whole freeze, not one output frame.
        startFrame: segment.kind === "freeze" ? segment.outputStart : segment.outputStart + (start - segStart),
        endFrame: segment.kind === "freeze" ? segment.outputStart + segment.durationFrames : segment.outputStart + (end - segStart),
        segmentIndex: index,
        offset: start - event.startFrame,
      });
    }
  });
  return result;
}

export function compileEdit(edit: Edit): CompiledEdit {
  const { segments, durationFrames } = buildSegments(
    edit.startFrame,
    edit.endFrame,
    edit.momentFrame,
    edit.freezeFrames,
    edit.replayFrames,
  );

  const captions: CompiledCaption[] = clipToSegments(edit.captions, segments).map((item) => {
    const caption = edit.captions.find((entry) => entry.id === item.id);
    if (!caption) throw new Error(`caption ${item.id} hilang`);
    return { ...caption, startFrame: item.startFrame, endFrame: item.endFrame, segmentIndex: item.segmentIndex };
  });

  const effects: CompiledEffect[] = clipToSegments(edit.effects, segments).map((item) => {
    const effect = edit.effects.find((entry) => entry.id === item.id);
    if (!effect) throw new Error(`effect ${item.id} hilang`);
    return {
      ...effect,
      startFrame: item.startFrame,
      endFrame: item.endFrame,
      segmentIndex: item.segmentIndex,
      sourceStartOffset: item.offset,
    };
  });

  return { segments, durationFrames, captions, effects };
}

export function sourceFrameAt(compiled: CompiledEdit, outputFrame: number): number {
  if (!Number.isInteger(outputFrame) || outputFrame < 0) {
    throw new Error(`output frame ${outputFrame} tidak valid`);
  }
  if (outputFrame >= compiled.durationFrames) {
    throw new Error(
      `output frame ${outputFrame} melewati durasi kompilasi ${compiled.durationFrames - 1}`,
    );
  }
  for (const segment of compiled.segments) {
    const start = segment.outputStart;
    const end = segment.outputStart + segment.durationFrames;
    if (outputFrame >= start && outputFrame < end) {
      const offset = outputFrame - start;
      if (segment.kind === "freeze") return segment.sourceStart;
      return Math.min(segment.sourceEnd - 1, segment.sourceStart + offset);
    }
  }
  throw new Error(`output frame ${outputFrame} tidak terpetakan ke segment mana pun`);
}

export function outputFrameAt(compiled: CompiledEdit, sourceFrame: number): number | null {
  for (const segment of compiled.segments) {
    if (segment.kind === "freeze") continue;
    if (sourceFrame >= segment.sourceStart && sourceFrame < segment.sourceEnd) {
      return segment.outputStart + (sourceFrame - segment.sourceStart);
    }
  }
  return null;
}

import React from "react";
import {
  AbsoluteFill,
  Freeze,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Edit } from "../shared/edit";
import { CANVAS } from "../shared/edit";
import { compileEdit, type Segment } from "../shared/timeline";
import { CaptionLayer } from "./CaptionLayer";
import { EffectLayer, computeVideoTransform } from "./EffectLayer";
import { AudioLayer } from "./AudioLayer";
import { loadFonts } from "./load-fonts";

export type VideoProps = {
  edit: Edit | null;
  sourceUrl: string;
  assetUrls: Record<string, string>;
};

const Backdrop: React.FC<{
  segment: Segment;
  sourceUrl: string;
  objectFit: "cover" | "contain";
}> = ({ segment, sourceUrl, objectFit }) => {
  const transform = computeBackdropTransform(objectFit, segment);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000000" }}>
      <AbsoluteFill style={{ filter: "blur(28px) brightness(0.55)", ...transform }}>
        <OffthreadVideo
          src={sourceUrl}
          trimBefore={segment.sourceStart}
          trimAfter={segment.sourceEnd}
          muted
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function computeBackdropTransform(
  objectFit: "cover" | "contain",
  segment: Segment,
): { transform: string; width: string; height: string } {
  void segment;
  if (objectFit === "cover") {
    return { transform: "scale(1.15)", width: "100%", height: "100%" };
  }
  return { transform: "scale(1.2)", width: "100%", height: "100%" };
}

export const FunnyMoment: React.FC<VideoProps> = ({ edit, sourceUrl, assetUrls }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  if (!edit) {
    return <InstructionalComposition width={width} height={height} />;
  }

  const compiled = compileEdit(edit);
  const videoTransform = computeVideoTransform(compiled.effects, frame);
  const objectFit = edit.layout === "crop" ? "cover" : "contain";
  const objectPosition = `${Math.round(edit.focusX * 100)}% ${Math.round(edit.focusY * 100)}%`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Backdrop segment={compiled.segments[0] ?? { kind: "normal", sourceStart: edit.startFrame, sourceEnd: edit.endFrame, outputStart: 0, durationFrames: 1 }} sourceUrl={sourceUrl} objectFit={objectFit} />
      <AbsoluteFill
        style={{
          overflow: "hidden",
          transform: videoTransform.transform,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {compiled.segments.map((segment, index) => {
          if (segment.kind === "freeze") {
            return (
              <Sequence
                key={`seg-${index}`}
                from={segment.outputStart}
                durationInFrames={segment.durationFrames}
                layout="none"
              >
                <Freeze frame={0}>
                  <OffthreadVideo src={sourceUrl} trimBefore={segment.sourceStart} muted />
                </Freeze>
              </Sequence>
            );
          }
          return (
            <Sequence
              key={`seg-${index}`}
              from={segment.outputStart}
              durationInFrames={segment.durationFrames}
              layout="none"
            >
              <OffthreadVideo
                src={sourceUrl}
                trimBefore={segment.sourceStart}
                trimAfter={segment.sourceEnd}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit,
                  objectPosition,
                }}
                muted={false}
                volume={1}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <EffectLayer effects={compiled.effects} assetUrls={assetUrls} />
      <CaptionLayer captions={compiled.captions} captionY={edit.captionY} height={height} />
      <AudioLayer effects={compiled.effects} assetUrls={assetUrls} />
    </AbsoluteFill>
  );
};

const InstructionalComposition: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const fontState = useFontLoader();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#111416",
        color: "#EDF1EE",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        textAlign: "center",
        fontFamily: "Barlow, sans-serif",
        opacity: fontState ? 1 : 0.6,
      }}
    >
      <div style={{ maxWidth: width * 0.8 }}>
        <div style={{ fontSize: 84, fontWeight: 700, marginBottom: 24 }}>Moment Lab</div>
        <div style={{ fontSize: 44, color: "#A9B4B1", lineHeight: 1.3 }}>
          Buat proyek di aplikasi, pilih satu momen dari video sumber, lalu render komposisi ini
          dengan inputProps yang memuat edit yang sudah tervalidasi.
        </div>
      </div>
    </AbsoluteFill>
  );
};

function useFontLoader(): boolean {
  React.useEffect(() => {
    void loadFonts();
  }, []);
  return true;
}

export const CANVAS_SIZE = CANVAS;
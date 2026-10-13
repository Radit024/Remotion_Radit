import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompiledCaption } from "../shared/timeline";
import { SAFE_AREA } from "../shared/edit";

type Props = {
  captions: CompiledCaption[];
  captionY: number;
  height: number;
};

export const CaptionLayer: React.FC<Props> = ({ captions, captionY, height }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const active = captions.filter((caption) => caption.startFrame <= frame && frame < caption.endFrame);

  const bottom = height * (1 - captionY);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {active.map((caption) => {
        const localFrame = frame - caption.startFrame;
        const localDuration = Math.max(1, caption.endFrame - caption.startFrame);
        const enter = interpolate(localFrame, [0, Math.min(6, localDuration)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const exit = interpolate(
          frame,
          [caption.endFrame - Math.min(6, localDuration), caption.endFrame],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const opacity = Math.min(enter, exit);
        void durationInFrames;
        return (
          <div
            key={caption.id}
            style={{
              position: "absolute",
              left: SAFE_AREA.left,
              right: SAFE_AREA.right,
              bottom,
              opacity,
              transform: `translateY(${(1 - enter) * 24}px)`,
            }}
          >
            <div
              style={{
                display: "inline-block",
                maxWidth: "100%",
                padding: "10px 20px",
                borderRadius: 14,
                background: "rgba(10, 12, 13, 0.72)",
                color: "#EDF1EE",
                fontFamily: "Sora, sans-serif",
                fontWeight: 700,
                fontSize: 58,
                lineHeight: 1.16,
                textAlign: "center",
                textShadow: "0 4px 18px rgba(0,0,0,0.6)",
                wordBreak: "break-word",
              }}
            >
              {caption.speaker ? (
                <span style={{ color: "#79CDD0", marginRight: 12, fontSize: 44, fontWeight: 600 }}>
                  {caption.speaker}
                </span>
              ) : null}
              {caption.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
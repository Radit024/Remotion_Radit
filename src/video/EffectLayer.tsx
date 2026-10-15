import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import type { CompiledEffect } from "../shared/timeline";

export type TransformStyle = {
  transform: string;
};

export function computeVideoTransform(
  effects: CompiledEffect[],
  frame: number,
): TransformStyle {
  const zoom = effects.find((effect) => effect.kind === "zoom" && isActive(effect, frame));
  const shake = effects.find((effect) => effect.kind === "shake" && isActive(effect, frame));

  const scale = zoom
    ? interpolate(frame, [zoom.startFrame, zoom.endFrame], [1, zoom.strength], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  let offsetX = 0;
  let offsetY = 0;
  if (shake) {
    const t = frame - shake.startFrame;
    const amplitude = Math.min(12, shake.strength);
    offsetX = Math.sin(t * 2.1) * amplitude;
    offsetY = Math.cos(t * 1.7) * amplitude * 0.6;
  }

  return { transform: `scale(${scale}) translate(${offsetX}px, ${offsetY}px)` };
}

type Props = {
  effects: CompiledEffect[];
  assetUrls: Record<string, string>;
};

export const EffectLayer: React.FC<Props> = ({ effects, assetUrls }) => {
  const frame = useCurrentFrame();
  const reaction = effects.find((effect) => effect.kind === "reaction" && isActive(effect, frame));
  const image = effects.find((effect) => effect.kind === "image" && isActive(effect, frame));

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {image && image.assetId && assetUrls[image.assetId] ? (
        <Img
          key={`${image.id}-${image.segmentIndex}`}
          src={assetUrls[image.assetId]}
          style={{
            position: "absolute",
            right: 60,
            top: 240,
            width: 400,
            borderRadius: 24,
            transform: `rotate(${interpolate(
              frame,
              [image.startFrame, image.startFrame + 8],
              [8, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )}deg)`,
          }}
        />
      ) : null}
      {reaction ? (
        <div
          key={`${reaction.id}-${reaction.segmentIndex}`}
          style={{
            position: "absolute",
            top: 140,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: '"Barlow Condensed", Sora, sans-serif',
            fontWeight: 800,
            fontSize: 130,
            lineHeight: 1.05,
            color: "#FFC879",
            textShadow: "0 6px 24px rgba(0,0,0,0.55)",
            transform: `scale(${interpolate(
              frame,
              [reaction.startFrame, reaction.startFrame + 6],
              [0.6, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )})`,
          }}
        >
          {reaction.text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

function isActive(effect: { startFrame: number; endFrame: number }, frame: number): boolean {
  return effect.startFrame <= frame && frame < effect.endFrame;
}
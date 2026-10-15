import React from "react";
import { Audio, Sequence } from "remotion";
import type { CompiledEffect } from "../shared/timeline";

type Props = {
  effects: CompiledEffect[];
  assetUrls: Record<string, string>;
  sfxGain?: number;
};

export const AudioLayer: React.FC<Props> = ({ effects, assetUrls, sfxGain = 0.35 }) => {
  const sfx = effects.filter(
    (effect) => effect.kind === "sfx" && effect.assetId && assetUrls[effect.assetId],
  );
  return (
    <>
      {sfx.map((effect) => (
        <Sequence
          key={`${effect.id}-${effect.segmentIndex}`}
          from={effect.startFrame}
          durationInFrames={Math.max(1, effect.endFrame - effect.startFrame)}
        >
          <Audio src={assetUrls[effect.assetId as string]} trimBefore={effect.sourceStartOffset} volume={sfxGain} />
        </Sequence>
      ))}
    </>
  );
};
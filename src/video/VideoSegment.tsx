import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import type { Segment } from "../shared/timeline";

type Props = {
  segment: Segment;
  sourceUrl: string;
  muted?: boolean;
};

export const VideoSegment: React.FC<Props> = ({ segment, sourceUrl, muted = false }) => {
  const trimBefore = segment.sourceStart;
  const trimAfter = segment.sourceEnd;
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000000" }}>
      <OffthreadVideo
        src={sourceUrl}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        muted={muted}
      />
    </AbsoluteFill>
  );
};

export const FreezeSegment: React.FC<{ segment: Segment; sourceUrl: string }> = ({
  segment,
  sourceUrl,
}) => {
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000000" }}>
      <OffthreadVideo src={sourceUrl} trimBefore={segment.sourceStart} muted />
    </AbsoluteFill>
  );
};
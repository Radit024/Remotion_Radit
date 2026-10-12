import React from "react";
import { Composition } from "remotion";
import { CANVAS, FPS } from "../shared/edit";
import { compileEdit } from "../shared/timeline";
import { FunnyMoment, type VideoProps } from "./FunnyMoment";

const emptyProps: VideoProps = {
  edit: null,
  sourceUrl: "",
  assetUrls: {},
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="FunnyMoment"
      component={FunnyMoment}
      width={CANVAS.width}
      height={CANVAS.height}
      fps={FPS}
      durationInFrames={1}
      defaultProps={emptyProps}
      calculateMetadata={({ props }) => {
        const edit = (props as VideoProps).edit;
        if (!edit) {
          return { durationInFrames: 1 };
        }
        return { durationInFrames: Math.max(1, compileEdit(edit).durationFrames) };
      }}
    />
  );
};
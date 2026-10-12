"use client";

import React, { useRef, useState, useEffect } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { FunnyMoment, type VideoProps } from "@/video/FunnyMoment";
import type { Edit } from "@/shared/edit";
import { CANVAS, FPS } from "@/shared/edit";
import { compileEdit } from "@/shared/timeline";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

type OutputPreviewProps = {
  edit: Edit;
  sourceUrl: string;
  assetUrls: Record<string, string>;
  onFrameUpdate?: (frame: number) => void;
};

export const OutputPreview: React.FC<OutputPreviewProps> = ({
  edit,
  sourceUrl,
  assetUrls,
  onFrameUpdate,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const compiled = compileEdit(edit);
  const durationInFrames = Math.max(1, compiled.durationFrames);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onFrameUpdate) return;

    const interval = setInterval(() => {
      onFrameUpdate(player.getCurrentFrame());
    }, 100);

    return () => clearInterval(interval);
  }, [onFrameUpdate]);

  const videoProps: VideoProps = {
    edit,
    sourceUrl,
    assetUrls,
  };

  return (
    <div className="relative flex flex-col items-center justify-center rounded-lg border border-[#30383c] bg-[#111416] p-3 text-[#EDF1EE]">
      {/* Top Bar inside preview */}
      <div className="flex w-full items-center justify-between pb-2 text-xs text-[#A9B4B1]">
        <span className="font-semibold text-[#EDF1EE]">Preview Vertikal 9:16 (Remotion)</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowSafeArea(!showSafeArea)}
          className="h-6 text-[11px] text-[#A9B4B1] hover:text-[#EDF1EE]"
        >
          {showSafeArea ? (
            <>
              <EyeOff className="mr-1 h-3 w-3" /> Sembunyikan Panduan
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3 w-3" /> Panduan Area Aman
            </>
          )}
        </Button>
      </div>

      {/* 9:16 Canvas Wrapper */}
      <div className="relative aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md border border-[#30383c] bg-black shadow-2xl">
        <Player
          ref={playerRef}
          component={FunnyMoment}
          inputProps={videoProps}
          durationInFrames={durationInFrames}
          compositionWidth={CANVAS.width}
          compositionHeight={CANVAS.height}
          fps={FPS}
          style={{ width: "100%", height: "100%" }}
          controls
          autoPlay={false}
          loop
        />

        {/* Safe Area Overlay Guide */}
        {showSafeArea && (
          <div className="pointer-events-none absolute inset-0 z-30 border-2 border-dashed border-[#D4F77C]/60">
            <div
              className="absolute border border-dashed border-[#FFC879]/80"
              style={{
                left: "7.4%",
                right: "16.6%",
                top: "8.3%",
                bottom: "16.6%",
              }}
            >
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] font-mono text-[#FFC879]">
                Safe Area (TikTok/Shorts)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

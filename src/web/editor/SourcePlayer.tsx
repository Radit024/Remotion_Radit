"use client";

import React, { useRef, useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Flag, ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FPS } from "@/shared/edit";

type SourcePlayerProps = {
  src: string;
  durationFrames: number;
  onSetStart: (frame: number) => void;
  onSetEnd: (frame: number) => void;
  onSetMoment: (frame: number) => void;
  startFrame: number;
  endFrame: number;
  momentFrame: number;
};

export const SourcePlayer: React.FC<SourcePlayerProps> = ({
  src,
  durationFrames,
  onSetStart,
  onSetEnd,
  onSetMoment,
  startFrame,
  endFrame,
  momentFrame,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const durationSec = durationFrames / FPS;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const f = Math.round(video.currentTime * FPS);
      setCurrentFrame(f);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const seekToFrame = (frame: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(frame, durationFrames));
    video.currentTime = clamped / FPS;
    setCurrentFrame(clamped);
  };

  const formatTime = (frame: number) => {
    const totalSec = frame / FPS;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const f = frame % FPS;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#30383c] bg-[#191e21] p-3 text-[#EDF1EE]">
      <div className="flex items-center justify-between text-xs text-[#A9B4B1]">
        <span className="font-semibold text-[#EDF1EE]">Player Video Sumber (Gameplay)</span>
        <span className="font-mono">
          {formatTime(currentFrame)} / {formatTime(durationFrames)} ({currentFrame} f)
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain"
          playsInline
        />
      </div>

      {/* Playback Controls & Markers */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={togglePlay}
            className="border-[#30383c] bg-[#111416] text-[#EDF1EE] hover:bg-[#30383c]"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => seekToFrame(Math.max(0, currentFrame - 30))}
            className="border-[#30383c] bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            title="-1 detik"
          >
            -1s
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => seekToFrame(Math.min(durationFrames, currentFrame + 30))}
            className="border-[#30383c] bg-[#111416] text-[#A9B4B1] hover:bg-[#30383c]"
            title="+1 detik"
          >
            +1s
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetStart(currentFrame)}
            className="border-[#30383c] bg-[#111416] text-xs text-[#EDF1EE] hover:bg-[#30383c]"
          >
            <ArrowLeftToLine className="mr-1 h-3.5 w-3.5 text-[#79CDD0]" />
            Ambil Awal ({formatTime(startFrame)})
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetMoment(currentFrame)}
            className="border-[#30383c] bg-[#111416] text-xs text-[#EDF1EE] hover:bg-[#30383c]"
          >
            <Flag className="mr-1 h-3.5 w-3.5 text-[#FFC879]" />
            Tandai Momen ({formatTime(momentFrame)})
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetEnd(currentFrame)}
            className="border-[#30383c] bg-[#111416] text-xs text-[#EDF1EE] hover:bg-[#30383c]"
          >
            <ArrowRightToLine className="mr-1 h-3.5 w-3.5 text-[#79CDD0]" />
            Ambil Akhir ({formatTime(endFrame)})
          </Button>
        </div>
      </div>
    </div>
  );
};

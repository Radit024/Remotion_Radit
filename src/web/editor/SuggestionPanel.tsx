"use client";

import React from "react";
import { Sparkles, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Effect } from "@/shared/edit";
import type { Suggestion } from "@/shared/suggestions";
import { FPS } from "@/shared/edit";

type SuggestionPanelProps = {
  suggestions: Suggestion[];
  onApplySuggestion: (suggestion: Suggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onTriggerSuggestions: () => void;
  isLoading: boolean;
  aiEnabled?: boolean;
};

export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  suggestions,
  onApplySuggestion,
  onDismissSuggestion,
  onTriggerSuggestions,
  isLoading,
  aiEnabled = false,
}) => {
  const formatSec = (frame: number) => (frame / FPS).toFixed(2);

  return (
    <div className="flex flex-col gap-3 text-xs text-[#EDF1EE]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#A9B4B1]">Saran AI (Efek & Reaksi)</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onTriggerSuggestions}
          disabled={!aiEnabled || isLoading}
          title={
            aiEnabled
              ? "Minta saran efek dan teks reaksi dari transkripsi"
              : "Dukungan AI OpenRouter sedang dinonaktifkan sementara. Efek dapat ditambahkan manual melalui Preset dan Stiker."
          }
          className={`border-[#D4F77C]/40 bg-[#111416] text-xs ${
            !aiEnabled
              ? "cursor-not-allowed opacity-50 text-[#A9B4B1] border-[#30383c]"
              : "text-[#D4F77C] hover:bg-[#D4F77C]/10"
          }`}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {isLoading ? "Menganalisis..." : aiEnabled ? "Minta Saran AI" : "AI Nonaktif"}
        </Button>
      </div>

      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
        {suggestions.length === 0 ? (
          <div className="rounded border border-dashed border-[#30383c] p-4 text-center text-[#A9B4B1]">
            {!aiEnabled
              ? "Dukungan AI OpenRouter dinonaktifkan sementara. Anda dapat mengatur preset efek zoom/shake dan menambahkan stiker/SFX secara langsung pada panel sebelah kiri."
              : "Belum ada saran efek AI. Klik tombol di atas untuk menganalisis momen dan subtitle."}
          </div>
        ) : (
          suggestions.map((sug) => (
            <div
              key={sug.id}
              className="flex flex-col gap-2 rounded border border-[#30383c] bg-[#111416] p-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-semibold text-[#FFC879]">
                  <Zap className="h-3.5 w-3.5" />
                  {sug.kind.toUpperCase()}{" "}
                  <span className="font-mono text-[10px] text-[#A9B4B1]">
                    ({formatSec(sug.startFrame)}s - {formatSec(sug.endFrame)}s)
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApplySuggestion(sug)}
                    className="h-6 border-[#D4F77C]/50 bg-transparent px-2 text-[11px] text-[#D4F77C] hover:bg-[#D4F77C]/10"
                  >
                    <Check className="mr-1 h-3 w-3" /> Terapkan
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismissSuggestion(sug.id)}
                    className="h-6 w-6 p-0 text-[#A9B4B1] hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {sug.text && (
                <div className="rounded bg-[#191e21] px-2 py-1 font-mono text-[11px] text-[#EDF1EE]">
                  "{sug.text}"
                </div>
              )}

              <p className="text-[11px] text-[#A9B4B1]">{sug.reason}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

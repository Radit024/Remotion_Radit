"use client";

import React, { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles, faCheck, faXmark, faBolt } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/shared/suggestions";
import { formatTimecode } from "@/shared/edit";

type SuggestionPanelProps = {
  suggestions: Suggestion[];
  onApplySuggestion: (suggestion: Suggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onTriggerSuggestions: () => void;
  isLoading: boolean;
  /** True only when the parent has confirmed that AI configuration is ready. */
  aiEnabled?: boolean;
  aiStatusLabel?: string;
};

export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  suggestions, onApplySuggestion, onDismissSuggestion, onTriggerSuggestions, isLoading, aiEnabled = false, aiStatusLabel,
}) => {
  const id = useId();
  const aiReady = aiEnabled === true;
  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel flex min-w-0 flex-col gap-3 type-control text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Saran AI (Efek & Reaksi)</h2>
        <Button type="button" size="sm" variant="outline" onClick={onTriggerSuggestions} disabled={!aiReady || isLoading} aria-describedby={`${id}-status`} className="type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faWandMagicSparkles} /> {isLoading ? "Menganalisis…" : "Minta Saran AI"}
        </Button>
      </div>
      <p id={`${id}-status`} role="status" className="type-help text-muted-foreground">{aiStatusLabel ?? (aiReady ? "AI siap. Saran dapat ditinjau sebelum diterapkan." : "AI belum tersedia. Preset, stiker dan SFX tetap dapat digunakan manual.")}</p>
      {isLoading && <p role="status" className="type-help text-muted-foreground">Menganalisis momen dan subtitle…</p>}
      {suggestions.length === 0 ? (aiReady && !isLoading ? <p className="type-help text-muted-foreground">Belum ada saran. Minta analisis momen dan subtitle dengan tombol di atas.</p> : null) : (
        <div className="panel-scroll flex max-h-96 flex-col gap-3 pr-1">
          {suggestions.map((suggestion, index) => <div key={suggestion.id} className="flex min-w-0 flex-col gap-2 rounded border border-border bg-background p-3">
            <span className="flex items-center gap-2 font-semibold text-track-moment"><FontAwesomeIcon aria-hidden="true" icon={faBolt} /> {suggestion.kind.toUpperCase()}</span>
            <span className="type-timecode text-muted-foreground">{formatTimecode(suggestion.startFrame)}–{formatTimecode(suggestion.endFrame)}</span>
            {suggestion.text && <p className="break-words font-reaction text-lg">“{suggestion.text}”</p>}
            <p className="type-help text-muted-foreground">{suggestion.reason}</p>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onApplySuggestion(suggestion)} aria-label={`Terapkan saran ${index + 1}`} className="type-control text-primary"><FontAwesomeIcon aria-hidden="true" icon={faCheck} /> Terapkan</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onDismissSuggestion(suggestion.id)} aria-label={`Abaikan saran ${index + 1}`} title={`Abaikan saran ${index + 1}`} className="text-muted-foreground hover:text-rose-400"><FontAwesomeIcon aria-hidden="true" icon={faXmark} /></Button>
            </div>
          </div>)}
        </div>
      )}
    </section>
  );
};

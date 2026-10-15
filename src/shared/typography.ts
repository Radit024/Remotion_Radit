// Literal families are shared with Remotion's locally loaded FontFace names.
export const CAPTION_FONT_FAMILY = "Sora";
export const CAPTION_FONT_STACK = `${CAPTION_FONT_FAMILY}, sans-serif`;
export const REACTION_FONT_FAMILY = "Barlow Condensed";
export const TIMECODE_FONT_FAMILY = "IBM Plex Mono";

// CSS utilities keep UI type sizes independent of panel density.
export const typography = {
  heading: "type-heading",
  panelTitle: "type-panel-title",
  control: "type-control",
  help: "type-help",
  metadata: "type-metadata",
  timecode: "type-timecode",
} as const;

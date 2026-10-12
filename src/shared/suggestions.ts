import { z } from "zod";
import type { Edit } from "./edit";
import { LIMITS } from "./edit";

export const SUGGESTION_KINDS = ["zoom", "shake", "reaction"] as const;

export const suggestionSchema = z.strictObject({
  id: z.string().min(1).max(64),
  kind: z.enum(SUGGESTION_KINDS),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  text: z.string().max(LIMITS.reactionMax),
  strength: z.number().min(0).max(LIMITS.zoomMax),
  reason: z.string().max(LIMITS.reasonMax),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export const suggestionResponseSchema = z.strictObject({
  suggestions: z.array(suggestionSchema).max(5),
});

export const suggestionJsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: [...SUGGESTION_KINDS] },
          startFrame: { type: "integer" },
          endFrame: { type: "integer" },
          text: { type: "string" },
          strength: { type: "number" },
          reason: { type: "string" },
        },
        required: ["id", "kind", "startFrame", "endFrame", "text", "strength", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

export function validateSuggestions(payload: unknown, edit: Pick<Edit, "startFrame" | "endFrame">): Suggestion[] {
  const parsed = suggestionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Respons AI tidak sesuai skema");
  }
  for (const suggestion of parsed.data.suggestions) {
    if (suggestion.startFrame >= suggestion.endFrame) {
      throw new Error("Saran AI memiliki startFrame >= endFrame");
    }
    if (suggestion.startFrame < edit.startFrame || suggestion.endFrame > edit.endFrame) {
      throw new Error("Saran AI berada di luar rentang pilihan");
    }
    if (suggestion.kind === "reaction" && suggestion.text.trim().length === 0) {
      throw new Error("Saran reaksi AI tanpa teks");
    }
  }
  return parsed.data.suggestions;
}

export function suggestionToEffect(
  suggestion: Suggestion,
  effectId: string,
): NonNullable<Edit["effects"]>[number] {
  return {
    id: effectId,
    kind: suggestion.kind,
    startFrame: suggestion.startFrame,
    endFrame: suggestion.endFrame,
    text: suggestion.kind === "reaction" ? suggestion.text : "",
    assetId: null,
    strength: suggestion.kind === "zoom" ? clampStrength(suggestion.strength) : suggestion.strength,
  };
}

function clampStrength(value: number): number {
  if (value < LIMITS.zoomMin) return LIMITS.zoomMin;
  if (value > LIMITS.zoomMax) return LIMITS.zoomMax;
  return value;
}

import { describe, it, expect } from "vitest";
import { mapUpstreamStatus, requireApiKey } from "../src/server/openrouter";
import { validateSuggestions } from "../src/shared/suggestions";

describe("OpenRouter AI integration and schema validation", () => {
  describe("mapUpstreamStatus", () => {
    it("maps 401 to API_AUTH_FAILED", () => {
      const err = mapUpstreamStatus(401, "Unauthorized");
      expect(err.code).toBe("API_AUTH_FAILED");
      expect(err.message).toContain("Periksa OPENROUTER_API_KEY");
    });

    it("maps 402 to API_PAYMENT_REQUIRED", () => {
      const err = mapUpstreamStatus(402, "Payment Required");
      expect(err.code).toBe("API_PAYMENT_REQUIRED");
      expect(err.message).toContain("Kredit OpenRouter habis");
    });

    it("maps 429 to API_RATE_LIMITED", () => {
      const err = mapUpstreamStatus(429, "Too Many Requests");
      expect(err.code).toBe("API_RATE_LIMITED");
      expect(err.message).toContain("membatasi laju");
    });

    it("maps 503 to AI_UPSTREAM_ERROR", () => {
      const err = mapUpstreamStatus(503, "Service Unavailable");
      expect(err.code).toBe("AI_UPSTREAM_ERROR");
    });
  });

  describe("validateSuggestions", () => {
    const editRange = { startFrame: 2400, endFrame: 3300 };

    it("accepts valid suggestion list within range", () => {
      const payload = {
        suggestions: [
          {
            id: "s1",
            kind: "zoom",
            startFrame: 2952,
            endFrame: 2980,
            text: "",
            strength: 1.25,
            reason: "Fokus pada kejadian lucu",
          },
        ],
      };
      const result = validateSuggestions(payload, editRange);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe("zoom");
    });

    it("rejects suggestions with startFrame >= endFrame", () => {
      const payload = {
        suggestions: [
          {
            id: "s1",
            kind: "zoom",
            startFrame: 2980,
            endFrame: 2950,
            text: "",
            strength: 1.25,
            reason: "Timing salah",
          },
        ],
      };
      expect(() => validateSuggestions(payload, editRange)).toThrowError(
        /startFrame >= endFrame/,
      );
    });

    it("rejects suggestions falling outside the edit selection range", () => {
      const payload = {
        suggestions: [
          {
            id: "s1",
            kind: "reaction",
            startFrame: 100, // outside [2400, 3300)
            endFrame: 200,
            text: "Wkwk",
            strength: 1,
            reason: "Di luar clip",
          },
        ],
      };
      expect(() => validateSuggestions(payload, editRange)).toThrowError(
        /di luar rentang/,
      );
    });

    it("rejects invalid json schema / unexpected fields", () => {
      const invalid = {
        suggestions: [
          {
            id: "s1",
            kind: "unknown_kind", // invalid enum
            startFrame: 2500,
            endFrame: 2600,
            text: "",
            strength: 1,
            reason: "Invalid",
          },
        ],
      };
      expect(() => validateSuggestions(invalid, editRange)).toThrowError(
        /tidak sesuai skema/,
      );
    });
  });
});

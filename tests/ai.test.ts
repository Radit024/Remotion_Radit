import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  mapUpstreamStatus,
  requireApiKey,
  requireSttApiKey,
  transcriptionUrl,
} from "../src/server/openrouter";
import { aiConfig, dirs, ensureDataDirs } from "../src/server/env";
import { validateSuggestions } from "../src/shared/suggestions";
import { transcribeSelectedRange } from "../src/server/transcribe";
import { writeAssetManifest, type StoredAsset } from "../src/server/assets";
import * as processMod from "../src/server/process";

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

  describe("requireApiKey & AI disabled state", () => {
    it("throws MODEL_UNSUPPORTED when AI is disabled", () => {
      const prevEnable = process.env.ENABLE_AI;
      delete process.env.ENABLE_AI;
      try {
        expect(() => requireApiKey()).toThrowError(/dinonaktifkan sementara/);
      } finally {
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
      }
    });

    it("throws API_KEY_MISSING when AI is enabled but key is missing", () => {
      const prevEnable = process.env.ENABLE_AI;
      const prevKey = process.env.OPENROUTER_API_KEY;
      process.env.ENABLE_AI = "true";
      delete process.env.OPENROUTER_API_KEY;
      try {
        expect(() => requireApiKey()).toThrowError(/OPENROUTER_API_KEY belum dikonfigurasi/);
      } finally {
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
      }
    });

    it("returns key when AI is enabled and key is present", () => {
      const prevEnable = process.env.ENABLE_AI;
      const prevKey = process.env.OPENROUTER_API_KEY;
      process.env.ENABLE_AI = "true";
      process.env.OPENROUTER_API_KEY = "sk-or-test12345";
      try {
        expect(requireApiKey()).toBe("sk-or-test12345");
      } finally {
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
        else delete process.env.OPENROUTER_API_KEY;
      }
    });
  });

  describe("9Router and flexible STT configuration", () => {
    it("maps 9Router upstream errors with correct messages", () => {
      const authErr = mapUpstreamStatus(401, "Unauthorized", "9Router");
      expect(authErr.code).toBe("API_AUTH_FAILED");
      expect(authErr.message).toContain("9Router menolak kunci API");
      expect(authErr.message).toContain("Periksa STT_API_KEY");

      const payErr = mapUpstreamStatus(402, "Payment Required", "9Router");
      expect(payErr.code).toBe("API_PAYMENT_REQUIRED");
      expect(payErr.message).toContain("Kredit 9Router habis");

      const rateErr = mapUpstreamStatus(429, "Too Many Requests", "9Router");
      expect(rateErr.code).toBe("API_RATE_LIMITED");
      expect(rateErr.message).toContain("9Router membatasi laju");

      const serverErr = mapUpstreamStatus(503, "Unavailable", "9Router");
      expect(serverErr.code).toBe("AI_UPSTREAM_ERROR");
      expect(serverErr.message).toContain("9Router sedang tidak tersedia");
    });

    it("generates correct transcriptionUrl for openrouter and 9router", () => {
      expect(transcriptionUrl("openrouter")).toBe(
        "https://openrouter.ai/api/v1/audio/transcriptions",
      );
      expect(transcriptionUrl("9router")).toBe(
        "http://127.0.0.1:20128/v1/audio/transcriptions",
      );
      expect(
        transcriptionUrl("9router", "http://localhost:8000/v1"),
      ).toBe("http://localhost:8000/v1/audio/transcriptions");
    });

    it("correctly configures aiConfig when STT_PROVIDER is 9router", () => {
      const prevEnable = process.env.ENABLE_AI;
      const prevProvider = process.env.STT_PROVIDER;
      const prevModel = process.env.STT_MODEL;
      const prevBase = process.env.STT_BASE_URL;

      process.env.ENABLE_AI = "true";
      process.env.STT_PROVIDER = "9router";
      process.env.STT_MODEL = "whisper-large-v3";
      process.env.STT_BASE_URL = "http://localhost:20128/v1";

      try {
        const config = aiConfig();
        expect(config.sttProvider).toBe("9router");
        expect(config.transcriptionModel).toBe("whisper-large-v3");
        expect(config.sttBaseUrl).toBe("http://localhost:20128/v1");
        expect(config.sttApiKeyPresent).toBe(true);

        const key = requireSttApiKey();
        expect(key).toBe("9router");
      } finally {
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevProvider !== undefined) process.env.STT_PROVIDER = prevProvider;
        else delete process.env.STT_PROVIDER;
        if (prevModel !== undefined) process.env.STT_MODEL = prevModel;
        else delete process.env.STT_MODEL;
        if (prevBase !== undefined) process.env.STT_BASE_URL = prevBase;
        else delete process.env.STT_BASE_URL;
      }
    });

    it("requires OPENROUTER_API_KEY when STT_PROVIDER is openrouter", () => {
      const prevEnable = process.env.ENABLE_AI;
      const prevProvider = process.env.STT_PROVIDER;
      const prevKey = process.env.OPENROUTER_API_KEY;
      const prevSttKey = process.env.STT_API_KEY;

      process.env.ENABLE_AI = "true";
      process.env.STT_PROVIDER = "openrouter";
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.STT_API_KEY;

      try {
        expect(() => requireSttApiKey()).toThrowError(/OPENROUTER_API_KEY belum dikonfigurasi/);
      } finally {
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevProvider !== undefined) process.env.STT_PROVIDER = prevProvider;
        else delete process.env.STT_PROVIDER;
        if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
        if (prevSttKey !== undefined) process.env.STT_API_KEY = prevSttKey;
      }
    });

    it("sends multipart/form-data to 9Router and parses captions", async () => {
      ensureDataDirs();
      const testAssetId = "stt-test-asset-9router";
      const testAsset: StoredAsset = {
        id: testAssetId,
        kind: "video",
        name: "clip.mp4",
        relativePath: `${testAssetId}.mp4`,
        filename: `${testAssetId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 1024,
        durationFrames: 300,
        width: 1920,
        height: 1080,
        hasAudio: true,
        previewReady: true,
        codec: "h264",
        frameRate: 30,
        proxyRelativePath: null,
        createdAt: new Date().toISOString(),
      };
      writeAssetManifest({ [testAssetId]: testAsset });
      fs.writeFileSync(path.join(dirs().assets, testAsset.relativePath), Buffer.from("dummy-video"));

      const prevEnable = process.env.ENABLE_AI;
      const prevProvider = process.env.STT_PROVIDER;
      const prevModel = process.env.STT_MODEL;
      const prevBase = process.env.STT_BASE_URL;

      process.env.ENABLE_AI = "true";
      process.env.STT_PROVIDER = "9router";
      process.env.STT_MODEL = "whisper-large-v3";
      process.env.STT_BASE_URL = "http://127.0.0.1:20128/v1";

      const runToolSpy = vi.spyOn(processMod, "runTool").mockImplementation(async (_tool, args) => {
        const wavPath = args[args.length - 1];
        fs.writeFileSync(wavPath, Buffer.from("RIFFdummyWAV"));
        return { stdout: "", stderr: "" };
      });

      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            text: "Tes audio 9Router",
            segments: [
              { id: 0, start: 0.5, end: 2.0, text: "Tes audio 9Router" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      try {
        const outcome = await transcribeSelectedRange(
          testAssetId,
          0,
          90,
          new AbortController().signal,
        );

        expect(capturedUrl).toBe("http://127.0.0.1:20128/v1/audio/transcriptions");
        expect(capturedInit?.body).toBeInstanceOf(FormData);
        const fd = capturedInit?.body as FormData;
        expect(fd.get("model")).toBe("whisper-large-v3");
        expect(fd.get("response_format")).toBe("verbose_json");
        expect(fd.get("file")).toBeDefined();

        expect(outcome.captions.length).toBe(1);
        expect(outcome.captions[0].text).toBe("Tes audio 9Router");
      } finally {
        runToolSpy.mockRestore();
        fetchSpy.mockRestore();
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevProvider !== undefined) process.env.STT_PROVIDER = prevProvider;
        else delete process.env.STT_PROVIDER;
        if (prevModel !== undefined) process.env.STT_MODEL = prevModel;
        else delete process.env.STT_MODEL;
        if (prevBase !== undefined) process.env.STT_BASE_URL = prevBase;
        else delete process.env.STT_BASE_URL;
      }
    });

    it("sends JSON input_audio payload when transcribing with OpenRouter", async () => {
      ensureDataDirs();
      const testAssetId = "stt-test-asset-openrouter";
      const testAsset: StoredAsset = {
        id: testAssetId,
        kind: "video",
        name: "clip2.mp4",
        relativePath: `${testAssetId}.mp4`,
        filename: `${testAssetId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 1024,
        durationFrames: 300,
        width: 1920,
        height: 1080,
        hasAudio: true,
        previewReady: true,
        codec: "h264",
        frameRate: 30,
        proxyRelativePath: null,
        createdAt: new Date().toISOString(),
      };
      writeAssetManifest({ [testAssetId]: testAsset });
      fs.writeFileSync(path.join(dirs().assets, testAsset.relativePath), Buffer.from("dummy-video"));

      const prevEnable = process.env.ENABLE_AI;
      const prevProvider = process.env.STT_PROVIDER;
      const prevKey = process.env.OPENROUTER_API_KEY;
      const prevModel = process.env.OPENROUTER_TRANSCRIPTION_MODEL;

      process.env.ENABLE_AI = "true";
      process.env.STT_PROVIDER = "openrouter";
      process.env.OPENROUTER_API_KEY = "sk-or-testkey";
      process.env.OPENROUTER_TRANSCRIPTION_MODEL = "openai/whisper-large-v3";

      const runToolSpy = vi.spyOn(processMod, "runTool").mockImplementation(async (_tool, args) => {
        const wavPath = args[args.length - 1];
        fs.writeFileSync(wavPath, Buffer.from("RIFFdummyWAV"));
        return { stdout: "", stderr: "" };
      });

      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            text: "Tes audio OpenRouter",
            segments: [
              { id: 0, start: 0.1, end: 1.8, text: "Tes audio OpenRouter" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      try {
        const outcome = await transcribeSelectedRange(
          testAssetId,
          0,
          90,
          new AbortController().signal,
        );

        expect(capturedUrl).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
        expect(typeof capturedInit?.body).toBe("string");
        const payload = JSON.parse(capturedInit?.body as string);
        expect(payload.model).toBe("openai/whisper-large-v3");
        expect(payload.input_audio?.data).toBeDefined();

        expect(outcome.captions.length).toBe(1);
        expect(outcome.captions[0].text).toBe("Tes audio OpenRouter");
      } finally {
        runToolSpy.mockRestore();
        fetchSpy.mockRestore();
        if (prevEnable !== undefined) process.env.ENABLE_AI = prevEnable;
        else delete process.env.ENABLE_AI;
        if (prevProvider !== undefined) process.env.STT_PROVIDER = prevProvider;
        else delete process.env.STT_PROVIDER;
        if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
        else delete process.env.OPENROUTER_API_KEY;
        if (prevModel !== undefined) process.env.OPENROUTER_TRANSCRIPTION_MODEL = prevModel;
        else delete process.env.OPENROUTER_TRANSCRIPTION_MODEL;
      }
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

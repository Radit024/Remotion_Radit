import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveEngineStatus } from "../src/web/engine-status";
import { fetchHealth, fetchJob, fetchProject, recoverProjectSource, type HealthInfo } from "../src/web/api";
import { aiConfig } from "../src/server/env";
import { GET } from "../src/app/api/health/route";
import { runTool } from "../src/server/process";

vi.mock("../src/server/process", () => ({ runTool: vi.fn() }));

const health = (): HealthInfo => ({
  status: "ok",
  ffmpeg: true,
  ai: {
    enabled: true,
    configured: true,
    suggestionModel: "suggestion-model",
    transcriptionModel: "transcription-model",
    issues: [],
    capabilities: {
      stt: { enabled: true, credentialPresent: true, modelConfigured: true, issues: [] },
      suggestions: { enabled: true, credentialPresent: true, modelConfigured: true, issues: [] },
    },
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("deriveEngineStatus", () => {
  it("never calls unknown health ready", () => {
    const result = deriveEngineStatus(null);
    expect(result.status).toBe("unknown");
    expect(result.label).toContain("belum diketahui");
    expect(result.stt.status).toBe("unknown");
    expect(result.suggestions.status).toBe("unknown");
    expect(result.ffmpeg).toMatchObject({ status: "unknown", ready: false });
  });

  it("disabled wins over credentials and old configured values", () => {
    const value = health();
    value.ai.enabled = false;
    const result = deriveEngineStatus(value);
    expect(result.status).toBe("disabled");
    expect(result.label).toBe("AI nonaktif — edit manual tersedia");
    expect(result.stt.status).toBe("disabled");
    expect(result.suggestions.status).toBe("disabled");
  });

  it.each(["stt", "suggestions"] as const)("separates missing %s credentials from the other capability", (kind) => {
    const value = health();
    value.ai.configured = false;
    value.ai.capabilities![kind].credentialPresent = false;
    const result = deriveEngineStatus(value);
    expect(result.status).toBe("unavailable");
    expect(result[kind].status).toBe("unavailable");
    expect(result[kind].issues).toContain("Kredensial belum diisi");
    expect(result[kind === "stt" ? "suggestions" : "stt"].status).toBe("ready");
  });

  it("a model issue prevents readiness without contaminating the other capability", () => {
    const value = health();
    value.ai.capabilities!.suggestions.modelConfigured = false;
    value.ai.capabilities!.suggestions.issues = ["Model saran AI belum diisi"];
    value.ai.issues = ["Model saran AI belum diisi"];
    const result = deriveEngineStatus(value);
    expect(result.status).toBe("unavailable");
    expect(result.stt.status).toBe("ready");
    expect(result.suggestions.status).toBe("unavailable");
  });

  it("reports configuration readiness, not upstream verification; FFmpeg is separate", () => {
    const value = health();
    value.ffmpeg = false;
    const result = deriveEngineStatus(value);
    expect(result.status).toBe("ready");
    expect(result.label).toBe("Terkonfigurasi");
    expect(result.stt.label).toBe("Terkonfigurasi");
    expect(result.suggestions.label).toBe("Terkonfigurasi");
    expect(result.ffmpeg).toMatchObject({ status: "unavailable", ready: false });
    expect(deriveEngineStatus(health()).ffmpeg.ready).toBe(true);
  });

  it("an aggregate configuration failure is never called ready", () => {
    const value = health();
    value.ai.configured = false;
    expect(deriveEngineStatus(value).status).toBe("unavailable");
    value.ai.configured = true;
    value.ai.issues = ["Konfigurasi belum lengkap"];
    expect(deriveEngineStatus(value).status).toBe("unavailable");
  });

  it("accepts legacy health without treating configured alone as proof", () => {
    const value = health();
    delete value.ai.capabilities;
    expect(deriveEngineStatus(value).label).toBe("Terkonfigurasi");
    value.ai.suggestionModel = "  ";
    const result = deriveEngineStatus(value);
    expect(result.status).toBe("unavailable");
    expect(result.stt.status).toBe("ready");
    expect(result.suggestions.status).toBe("unavailable");
    value.ai.configured = false;
    expect(deriveEngineStatus(value).stt.status).toBe("unavailable");
    delete value.ai.enabled;
    expect(deriveEngineStatus(value).status).toBe("unknown");
  });

  it("legacy issues prevent readiness", () => {
    const value = health();
    delete value.ai.capabilities;
    value.ai.issues = ["Model belum dikonfigurasi"];
    expect(deriveEngineStatus(value).status).toBe("unavailable");
  });
});

describe("local health capability contracts", () => {
  beforeEach(() => {
    for (const name of ["ENABLE_AI", "OPENROUTER_API_KEY", "OPENROUTER_SUGGESTION_MODEL", "OPENROUTER_TRANSCRIPTION_MODEL", "OPENROUTER_TRANSCRIPTION_LANGUAGE", "STT_PROVIDER", "STT_MODEL", "STT_API_KEY", "STT_BASE_URL", "STT_LANGUAGE", "NINEROUTER_BASE_URL"]) {
      vi.stubEnv(name, "");
    }
    vi.mocked(runTool).mockResolvedValue({ stdout: "ffmpeg", stderr: "" });
  });

  async function readHealth(): Promise<HealthInfo> {
    const response = await GET(new Request("http://127.0.0.1:3000/api/health", { headers: { host: "127.0.0.1:3000" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return response.json();
  }

  it("returns disabled even if a credential/model exists", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "secret-not-exposed");
    vi.stubEnv("STT_MODEL", "configured-model");
    const value = await readHealth();
    expect(value.ai.capabilities!.stt).toMatchObject({ enabled: false, credentialPresent: true, modelConfigured: true });
    expect(value.ai.configured).toBe(false);
    expect(deriveEngineStatus(value).status).toBe("disabled");
  });

  it.each(["openrouter", "openai"])("requires a credential for %s STT and suggestions independently", async (provider) => {
    vi.stubEnv("ENABLE_AI", "true");
    vi.stubEnv("STT_PROVIDER", provider);
    vi.stubEnv("STT_MODEL", "stt-model");
    vi.stubEnv("OPENROUTER_SUGGESTION_MODEL", "suggest-model");
    const value = await readHealth();
    expect(value.ai.capabilities!.stt.credentialPresent).toBe(false);
    expect(value.ai.capabilities!.suggestions.credentialPresent).toBe(false);
    expect(deriveEngineStatus(value).status).toBe("unavailable");
  });

  it("STT_API_KEY configures STT but never supplies suggestion credentials", async () => {
    vi.stubEnv("ENABLE_AI", "1");
    vi.stubEnv("STT_API_KEY", "private-stt-key");
    vi.stubEnv("STT_MODEL", "stt-model");
    vi.stubEnv("OPENROUTER_SUGGESTION_MODEL", "suggest-model");
    const value = await readHealth();
    expect(deriveEngineStatus(value).stt.status).toBe("ready");
    expect(deriveEngineStatus(value).suggestions.status).toBe("unavailable");
    expect(JSON.stringify(value)).not.toContain("private-stt-key");
  });

  it("9router defaults only configure STT; models alone never configure suggestions", async () => {
    vi.stubEnv("ENABLE_AI", "true");
    vi.stubEnv("STT_PROVIDER", "9router");
    vi.stubEnv("OPENROUTER_SUGGESTION_MODEL", "suggest-model");
    const value = await readHealth();
    expect(value.ai.capabilities!.stt).toEqual({ enabled: true, credentialPresent: true, modelConfigured: true, issues: [] });
    expect(value.ai.configured).toBe(false);
    expect(deriveEngineStatus(value).stt.status).toBe("ready");
    expect(deriveEngineStatus(value).suggestions.status).toBe("unavailable");
  });

  it("missing models and invalid local endpoint/provider produce fixed issues, never secret values", async () => {
    vi.stubEnv("ENABLE_AI", "true");
    vi.stubEnv("STT_PROVIDER", "unknown-private-provider");
    vi.stubEnv("STT_BASE_URL", "bad-private-endpoint");
    vi.stubEnv("OPENROUTER_API_KEY", "private-key");
    const value = await readHealth();
    expect(value.ai.capabilities!.stt.modelConfigured).toBe(false);
    expect(value.ai.capabilities!.suggestions.modelConfigured).toBe(false);
    expect(value.ai.capabilities!.stt.issues).toContain("STT_PROVIDER tidak dikenali");
    expect(value.ai.capabilities!.stt.issues).toContain("Konfigurasi endpoint STT tidak valid");
    expect(JSON.stringify(value)).not.toMatch(/private-key|bad-private-endpoint|unknown-private-provider|sttBaseUrl|sttApiKey/);
  });

  it("health is configuration-only and never requests an upstream or changes AI config", async () => {
    vi.stubEnv("ENABLE_AI", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "private-key");
    vi.stubEnv("STT_API_KEY", "private-stt-key");
    vi.stubEnv("STT_BASE_URL", "https://private.example/v1");
    vi.stubEnv("STT_MODEL", "stt-model");
    vi.stubEnv("OPENROUTER_SUGGESTION_MODEL", "suggest-model");
    const before = aiConfig();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const value = await readHealth();
    expect(deriveEngineStatus(value).label).toBe("Terkonfigurasi");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runTool).toHaveBeenLastCalledWith("ffmpeg", ["-version"], { timeoutMs: 3000 });
    expect(aiConfig()).toEqual(before);
    expect(JSON.stringify(value)).not.toMatch(/private-key|private-stt-key|private\.example|sttBaseUrl|sttApiKey/);
  });

  it("reports a failed local FFmpeg check separately", async () => {
    vi.mocked(runTool).mockRejectedValue(new Error("unavailable"));
    expect((await readHealth()).ffmpeg).toBe(false);
  });
});

describe("client request contracts", () => {
  it("fetchHealth only requests the local health route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(health()));
    await fetchHealth();
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith("/api/health");
  });

  it("forwards optional abort signals for project and job requests", async () => {
    const signal = new AbortController().signal;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => Response.json(String(url).includes("jobs") ? { job: { id: "job" } } : { project: { id: "project" } }));
    await fetchProject("project", signal);
    await fetchJob("job", signal);
    expect(fetchSpy).toHaveBeenCalledWith("/api/projects/project", { signal });
    expect(fetchSpy).toHaveBeenCalledWith("/api/jobs/job", { signal });
    await fetchProject("project");
    expect(fetchSpy).toHaveBeenLastCalledWith("/api/projects/project", undefined);
  });

  it("does not swallow AbortError", async () => {
    const error = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    await expect(fetchProject("project", new AbortController().signal)).rejects.toBe(error);
    await expect(fetchJob("job", new AbortController().signal)).rejects.toBe(error);
  });

  it("recovery only sends server asset UUID and revision", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ project: { id: "copy" } }));
    expect(await recoverProjectSource("original", "asset", 3)).toEqual({ id: "copy" });
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith("/api/projects/original/recover-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: "asset", revision: 3 }),
    });
  });
});

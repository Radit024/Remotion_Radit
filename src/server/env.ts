import fs from "node:fs";
import path from "node:path";

export const projectRoot = process.cwd();

export type SttProvider = "openrouter" | "9router" | "openai";

export type AiCapabilityConfig = {
  enabled: boolean;
  credentialPresent: boolean;
  modelConfigured: boolean;
  issues: string[];
};

export type AiConfig = {
  enabled: boolean;
  apiKeyPresent: boolean;
  suggestionModel: string;
  transcriptionModel: string;
  transcriptionLanguage: string;
  sttProvider: SttProvider;
  sttBaseUrl: string;
  sttApiKey: string;
  sttApiKeyPresent: boolean;
  capabilities: { stt: AiCapabilityConfig; suggestions: AiCapabilityConfig };
  issues: string[];
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function dataRoot(): string {
  const configured = readEnv("DATA_DIR");
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
  }
  return path.join(projectRoot, ".data");
}

export function dirs() {
  const root = dataRoot();
  return {
    root,
    assets: path.join(root, "assets"),
    projects: path.join(root, "projects"),
    jobs: path.join(root, "jobs"),
    outputs: path.join(root, "outputs"),
    tmp: path.join(root, "tmp"),
    locks: path.join(root, "locks"),
  };
}

export function maxUploadBytes(): number {
  const value = Number(readEnv("MAX_UPLOAD_BYTES"));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2 * 1024 * 1024 * 1024;
}

export function expectedHost(): string {
  return "127.0.0.1:3000";
}

export function aiConfig(): AiConfig {
  const enableEnv = readEnv("ENABLE_AI").toLowerCase();
  const enabled = enableEnv === "true" || enableEnv === "1";

  const rawSttProvider = readEnv("STT_PROVIDER").toLowerCase();
  const sttProvider: SttProvider =
    rawSttProvider === "9router" || rawSttProvider === "ninerouter"
      ? "9router"
      : rawSttProvider === "openai"
        ? "openai"
        : "openrouter";

  const defaultSttBase =
    sttProvider === "9router"
      ? "http://127.0.0.1:20128/v1"
      : "https://openrouter.ai/api/v1";

  const sttBaseUrl =
    readEnv("STT_BASE_URL") ||
    readEnv("NINEROUTER_BASE_URL") ||
    defaultSttBase;

  const sttApiKey =
    readEnv("STT_API_KEY") ||
    readEnv("OPENROUTER_API_KEY") ||
    (sttProvider === "9router" ? "9router" : "");

  const suggestionModel = readEnv("OPENROUTER_SUGGESTION_MODEL");
  const transcriptionModel =
    readEnv("STT_MODEL") ||
    readEnv("OPENROUTER_TRANSCRIPTION_MODEL") ||
    (sttProvider === "9router" ? "whisper-large-v3" : "");

  const transcriptionLanguage =
    readEnv("STT_LANGUAGE") ||
    readEnv("OPENROUTER_TRANSCRIPTION_LANGUAGE") ||
    "id";

  const sttApiKeyPresent = Boolean(sttApiKey);
  const openrouterKeyPresent = Boolean(readEnv("OPENROUTER_API_KEY"));
  const stt: AiCapabilityConfig = {
    enabled,
    credentialPresent: sttApiKeyPresent,
    modelConfigured: Boolean(transcriptionModel),
    issues: [],
  };
  const suggestions: AiCapabilityConfig = {
    enabled,
    credentialPresent: openrouterKeyPresent,
    modelConfigured: Boolean(suggestionModel),
    issues: [],
  };

  if (!enabled) {
    stt.issues.push("AI nonaktif — edit manual tersedia");
    suggestions.issues.push("AI nonaktif — edit manual tersedia");
  } else {
    if (!stt.credentialPresent) stt.issues.push("Kredensial STT belum diisi");
    if (!stt.modelConfigured) stt.issues.push("Model STT belum diisi");
    if (rawSttProvider && !["openrouter", "9router", "ninerouter", "openai"].includes(rawSttProvider)) {
      stt.issues.push("STT_PROVIDER tidak dikenali");
    }
    try {
      const endpoint = new URL(sttBaseUrl);
      if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
        stt.issues.push("Konfigurasi endpoint STT tidak valid");
      }
    } catch {
      stt.issues.push("Konfigurasi endpoint STT tidak valid");
    }
    if (!suggestions.credentialPresent) suggestions.issues.push("Kredensial saran AI belum diisi");
    if (!suggestions.modelConfigured) suggestions.issues.push("Model saran AI belum diisi");
  }
  const issues = [...new Set([...stt.issues, ...suggestions.issues])];
  const apiKeyPresent =
    enabled &&
    (sttProvider === "9router"
      ? sttApiKeyPresent || openrouterKeyPresent
      : openrouterKeyPresent);

  return {
    enabled,
    apiKeyPresent,
    suggestionModel,
    transcriptionModel,
    transcriptionLanguage,
    sttProvider,
    sttBaseUrl,
    sttApiKey,
    sttApiKeyPresent: enabled && sttApiKeyPresent,
    capabilities: { stt, suggestions },
    issues,
  };
}

export function ensureDataDirs(): void {
  for (const dir of Object.values(dirs())) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

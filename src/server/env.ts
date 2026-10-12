import fs from "node:fs";
import path from "node:path";

export const projectRoot = process.cwd();

export type SttProvider = "openrouter" | "9router" | "openai";

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

  const issues: string[] = [];

  if (!enabled) {
    issues.push("Dukungan AI OpenRouter dinonaktifkan sementara.");
  } else {
    if (!readEnv("OPENROUTER_API_KEY") && sttProvider === "openrouter") {
      issues.push("OPENROUTER_API_KEY belum diisi");
    }
    if (!suggestionModel) {
      issues.push("OPENROUTER_SUGGESTION_MODEL belum diisi");
    }
    if (!transcriptionModel) {
      if (sttProvider === "9router") {
        issues.push("STT_MODEL atau OPENROUTER_TRANSCRIPTION_MODEL belum diisi");
      } else {
        issues.push("OPENROUTER_TRANSCRIPTION_MODEL belum diisi");
      }
    }
  }

  const sttApiKeyPresent = Boolean(sttApiKey);
  const openrouterKeyPresent = Boolean(readEnv("OPENROUTER_API_KEY"));
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
    issues,
  };
}

export function ensureDataDirs(): void {
  for (const dir of Object.values(dirs())) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

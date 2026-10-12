import fs from "node:fs";
import path from "node:path";

export const projectRoot = process.cwd();

export type AiConfig = {
  apiKeyPresent: boolean;
  suggestionModel: string;
  transcriptionModel: string;
  transcriptionLanguage: string;
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
  const suggestionModel = readEnv("OPENROUTER_SUGGESTION_MODEL");
  const transcriptionModel = readEnv("OPENROUTER_TRANSCRIPTION_MODEL");
  const issues: string[] = [];
  if (!readEnv("OPENROUTER_API_KEY")) {
    issues.push("OPENROUTER_API_KEY belum diisi");
  }
  if (!suggestionModel) {
    issues.push("OPENROUTER_SUGGESTION_MODEL belum diisi");
  }
  if (!transcriptionModel) {
    issues.push("OPENROUTER_TRANSCRIPTION_MODEL belum diisi");
  }
  return {
    apiKeyPresent: Boolean(readEnv("OPENROUTER_API_KEY")),
    suggestionModel,
    transcriptionModel,
    transcriptionLanguage: readEnv("OPENROUTER_TRANSCRIPTION_LANGUAGE") || "id",
    issues,
  };
}

export function ensureDataDirs(): void {
  for (const dir of Object.values(dirs())) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

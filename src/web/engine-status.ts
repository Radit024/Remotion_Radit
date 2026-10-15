import type { AiCapabilityInfo, HealthInfo } from "./api";

export type EngineStatus = "unknown" | "disabled" | "unavailable" | "ready";
export type CapabilityStatus = { status: EngineStatus; label: string; issues: string[] };
export type EngineReadiness = {
  status: EngineStatus;
  label: string;
  stt: CapabilityStatus;
  suggestions: CapabilityStatus;
  ffmpeg: { status: "unknown" | "unavailable" | "ready"; label: string; ready: boolean };
};

const LABELS: Record<EngineStatus, string> = {
  unknown: "Status AI belum diketahui",
  disabled: "AI nonaktif — edit manual tersedia",
  unavailable: "AI belum tersedia — periksa konfigurasi",
  ready: "Terkonfigurasi",
};

function capabilityStatus(
  ai: HealthInfo["ai"] | undefined,
  capability: AiCapabilityInfo | undefined,
  model: string | undefined,
): CapabilityStatus {
  if (!ai) return { status: "unknown", label: LABELS.unknown, issues: [] };
  let issues = [...(capability?.issues ?? ai.issues)];
  let status: EngineStatus;
  if (ai.enabled === false || capability?.enabled === false) {
    status = "disabled";
  } else if (capability) {
    if (!capability.credentialPresent) issues.push("Kredensial belum diisi");
    if (!capability.modelConfigured) issues.push("Model belum diisi");
    status = issues.length === 0 ? "ready" : "unavailable";
  } else if (ai.enabled === undefined) {
    status = "unknown";
  } else {
    // Older health responses only prove credential presence via configured.
    if (!ai.configured) issues.push("Kredensial belum dikonfigurasi");
    if (!model?.trim()) issues.push("Model belum diisi");
    status = issues.length === 0 ? "ready" : "unavailable";
  }
  issues = [...new Set(issues)];
  return { status, label: LABELS[status], issues };
}

export function deriveEngineStatus(health: HealthInfo | null): EngineReadiness {
  const ai = health?.ai;
  const stt = capabilityStatus(ai, ai?.capabilities?.stt, ai?.transcriptionModel);
  const suggestions = capabilityStatus(ai, ai?.capabilities?.suggestions, ai?.suggestionModel);
  let status: EngineStatus;
  if (!ai) status = "unknown";
  else if (ai.enabled === false || (stt.status === "disabled" && suggestions.status === "disabled")) status = "disabled";
  else if (stt.status === "unknown" || suggestions.status === "unknown") status = "unknown";
  else if (stt.status === "ready" && suggestions.status === "ready" && ai.configured && ai.issues.length === 0) status = "ready";
  else status = "unavailable";

  return {
    status,
    label: LABELS[status],
    stt,
    suggestions,
    ffmpeg: {
      status: health === null ? "unknown" : health.ffmpeg ? "ready" : "unavailable",
      label: health === null ? "Status FFmpeg belum diketahui" : health.ffmpeg ? "FFmpeg tersedia" : "FFmpeg tidak tersedia",
      ready: health?.ffmpeg === true,
    },
  };
}

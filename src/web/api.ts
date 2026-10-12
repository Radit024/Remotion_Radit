import type { Asset, Edit } from "@/shared/edit";
import type { StoredProject, ProjectSummary } from "@/server/projects";
export type { ProjectSummary };

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export class ClientApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ClientApiError";
    this.code = code;
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `Permintaan gagal dengan status ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      if (data?.error) {
        code = data.error.code;
        message = data.error.message;
      }
    } catch {
      /* ignore json parse error */
    }
    throw new ClientApiError(code, message, res.status);
  }
  return res.json() as Promise<T>;
}

export type HealthInfo = {
  status: string;
  ffmpeg: boolean;
  ai: {
    configured: boolean;
    suggestionModel: string;
    transcriptionModel: string;
    issues: string[];
  };
};

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  return handleResponse<HealthInfo>(res);
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch("/api/projects");
  const data = await handleResponse<{ projects: ProjectSummary[] }>(res);
  return data.projects;
}

export async function createProject(assetId: string, name?: string): Promise<StoredProject> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, name }),
  });
  const data = await handleResponse<{ project: StoredProject }>(res);
  return data.project;
}

export async function fetchProject(id: string): Promise<StoredProject> {
  const res = await fetch(`/api/projects/${id}`);
  const data = await handleResponse<{ project: StoredProject }>(res);
  return data.project;
}

export async function saveProject(
  id: string,
  draft: Edit,
  revision: number,
): Promise<StoredProject> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"${revision}"`,
    },
    body: JSON.stringify(draft),
  });
  const data = await handleResponse<{ project: StoredProject }>(res);
  return data.project;
}

export async function uploadAsset(file: File): Promise<Asset> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/assets", {
    method: "POST",
    body: formData,
  });
  const data = await handleResponse<{ asset: Asset }>(res);
  return data.asset;
}

export async function fetchAssets(): Promise<Asset[]> {
  const res = await fetch("/api/assets");
  const data = await handleResponse<{ assets: Asset[] }>(res);
  return data.assets;
}

export type JobInfo = {
  id: string;
  kind: "proxy" | "transcribe" | "suggestions" | "render";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  projectId: string | null;
  revision: number | null;
  progress: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: unknown | null;
  error: { code: string; message: string } | null;
  outputId: string | null;
};

export async function triggerRender(id: string, revision: number): Promise<JobInfo> {
  const res = await fetch(`/api/projects/${id}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  });
  const data = await handleResponse<{ job: JobInfo }>(res);
  return data.job;
}

export async function triggerTranscribe(id: string, revision: number): Promise<JobInfo> {
  const res = await fetch(`/api/projects/${id}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  });
  const data = await handleResponse<{ job: JobInfo }>(res);
  return data.job;
}

export async function triggerSuggestions(id: string, revision: number): Promise<JobInfo> {
  const res = await fetch(`/api/projects/${id}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  });
  const data = await handleResponse<{ job: JobInfo }>(res);
  return data.job;
}

export async function fetchJob(id: string): Promise<JobInfo> {
  const res = await fetch(`/api/jobs/${id}`);
  const data = await handleResponse<{ job: JobInfo }>(res);
  return data.job;
}

export async function cancelJob(id: string): Promise<JobInfo> {
  const res = await fetch(`/api/jobs/${id}/cancel`, {
    method: "POST",
  });
  const data = await handleResponse<{ job: JobInfo }>(res);
  return data.job;
}

import { expectedHost } from "./env";

export type ApiErrorCode =
  | "VALIDATION"
  | "ASSET_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "BUSY"
  | "FILE_TOO_LARGE"
  | "MEDIA_UNSUPPORTED"
  | "NO_AUDIO"
  | "AI_INVALID_RESPONSE"
  | "TRANSCRIPT_TIMESTAMPS_UNAVAILABLE"
  | "DEPENDENCY_UNAVAILABLE"
  | "MODEL_UNSUPPORTED"
  | "API_KEY_MISSING"
  | "API_AUTH_FAILED"
  | "API_PAYMENT_REQUIRED"
  | "API_RATE_LIMITED"
  | "AI_UPSTREAM_ERROR"
  | "DISK_WRITE_FAILED"
  | "RENDER_FAILED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED";

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  ASSET_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REVISION_CONFLICT: 409,
  BUSY: 409,
  API_AUTH_FAILED: 401,
  API_PAYMENT_REQUIRED: 402,
  FILE_TOO_LARGE: 413,
  MEDIA_UNSUPPORTED: 415,
  NO_AUDIO: 422,
  AI_INVALID_RESPONSE: 422,
  TRANSCRIPT_TIMESTAMPS_UNAVAILABLE: 422,
  AI_UPSTREAM_ERROR: 502,
  DEPENDENCY_UNAVAILABLE: 503,
  MODEL_UNSUPPORTED: 503,
  API_KEY_MISSING: 503,
  API_RATE_LIMITED: 429,
  DISK_WRITE_FAILED: 500,
  RENDER_FAILED: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export function apiErrorResponse(error: ApiError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function errorResponse(code: ApiErrorCode, message: string): Response {
  return apiErrorResponse(new ApiError(code, message));
}

function normalizedHost(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("http://")) {
    try {
      return new URL(trimmed).host.toLowerCase();
    } catch {
      return null;
    }
  }
  if (lowered.startsWith("https://")) return null;
  return lowered;
}

export function checkHost(request: Request): void {
  const host = normalizedHost(request.headers.get("host"));
  const allowed = expectedHost().toLowerCase();
  if (host !== allowed) {
    throw new ApiError("VALIDATION", `Host ${host ?? "(kosong)"} tidak diizinkan; aplikasi ini hanya berjalan lokal`);
  }
}

export function checkFetchMetadata(request: Request): void {
  const metadata = request.headers.get("sec-fetch-site");
  if (metadata && metadata !== "same-origin" && metadata !== "none") {
    throw new ApiError("VALIDATION", "Permintaan lintas situs ditolak");
  }
}

export function checkOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  let originHost: string | null;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new ApiError("VALIDATION", "Origin tidak valid");
  }
  if (originHost !== expectedHost().toLowerCase()) {
    throw new ApiError("VALIDATION", "Origin tidak berasal dari origin lokal aplikasi");
  }
}

export function guardMutation(request: Request): void {
  checkHost(request);
  checkOrigin(request);
  checkFetchMetadata(request);
}

export function guardRead(request: Request): void {
  checkHost(request);
  checkFetchMetadata(request);
}

const ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function assertUuid(value: string, label = "id"): string {
  if (!ID_PATTERN.test(value) || value.includes("..") || value.includes("/") || value.includes("\\")) {
    throw new ApiError("VALIDATION", `${label} harus berupa UUID yang valid`);
  }
  return value;
}

export function noStore(init: ResponseInit = {}): ResponseInit {
  return { ...init, headers: { ...(init.headers ?? {}), "Cache-Control": "no-store" } };
}

export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return "invalid";
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = Number(startRaw);
  const end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start < 0 || start >= size || end < start) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}
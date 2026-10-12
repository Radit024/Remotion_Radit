import { aiConfig, type SttProvider } from "./env";
import { ApiError } from "./guard";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export type AiUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  model: string | null;
  provider: string | null;
};

export class AiError extends ApiError {
  readonly usage: AiUsage | null;
  constructor(
    code: ConstructorParameters<typeof ApiError>[0],
    message: string,
    usage: AiUsage | null = null,
  ) {
    super(code, message);
    this.name = "AiError";
    this.usage = usage;
  }
}

export function requireApiKey(): string {
  const config = aiConfig();
  if (!config.enabled) {
    throw new ApiError(
      "MODEL_UNSUPPORTED",
      "Dukungan AI OpenRouter sedang dinonaktifkan sementara. Gunakan input subtitle manual atau impor berkas SRT.",
    );
  }
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!key) {
    throw new ApiError(
      "API_KEY_MISSING",
      "OPENROUTER_API_KEY belum dikonfigurasi; transkripsi dan saran AI tidak tersedia",
    );
  }
  return key;
}

export function requireSttApiKey(): string {
  const config = aiConfig();
  if (!config.enabled) {
    throw new ApiError(
      "MODEL_UNSUPPORTED",
      "Dukungan AI OpenRouter sedang dinonaktifkan sementara. Gunakan input subtitle manual atau impor berkas SRT.",
    );
  }
  const key = config.sttApiKey;
  if (!key && config.sttProvider === "openrouter") {
    throw new ApiError(
      "API_KEY_MISSING",
      "OPENROUTER_API_KEY belum dikonfigurasi; transkripsi dan saran AI tidak tersedia",
    );
  }
  return key;
}

export function readLimitedBody(response: Response): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = response.body?.getReader();
    if (!reader) {
      response.text().then(resolve, reject);
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          reject(new AiError("AI_UPSTREAM_ERROR", "Respons AI melebihi batas ukuran yang diizinkan"));
          await reader.cancel();
          return;
        }
        chunks.push(value);
      }
      const buffer = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(new TextDecoder().decode(buffer));
    };
    void pump().catch(reject);
  });
}

export function mapUpstreamStatus(
  status: number,
  body: string,
  providerName: string = "OpenRouter",
): AiError {
  const snippet = body.slice(0, 200);
  if (status === 401) {
    const hint =
      providerName === "9Router"
        ? "Periksa STT_API_KEY atau konfigurasi 9Router."
        : "Periksa OPENROUTER_API_KEY.";
    return new AiError(
      "API_AUTH_FAILED",
      `${providerName} menolak kunci API (401). ${hint}`,
    );
  }
  if (status === 402) {
    return new AiError(
      "API_PAYMENT_REQUIRED",
      `Kredit ${providerName} habis (402). Isi ulang atau gunakan kunci lain.`,
    );
  }
  if (status === 429) {
    return new AiError(
      "API_RATE_LIMITED",
      `${providerName} membatasi laju permintaan (429). Coba lagi beberapa saat.`,
    );
  }
  if (status === 503) {
    return new AiError(
      "AI_UPSTREAM_ERROR",
      `${providerName} sedang tidak tersedia (503). Coba lagi sebentar.`,
    );
  }
  return new AiError(
    "AI_UPSTREAM_ERROR",
    `${providerName} mengembalikan status ${status}: ${snippet}`,
  );
}

export function isRetryable(error: unknown): boolean {
  return (
    error instanceof AiError &&
    (error.code === "API_RATE_LIMITED" || error.code === "AI_UPSTREAM_ERROR")
  );
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const compositeSignal = init.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  try {
    return await fetch(url, { ...init, signal: compositeSignal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiError(
        "AI_UPSTREAM_ERROR",
        `Permintaan OpenRouter melebihi ${timeoutMs} ms`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new AiError(
      "AI_UPSTREAM_ERROR",
      `Gagal menghubungi OpenRouter: ${message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function authHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "http://127.0.0.1:3000",
    "X-Title": "Moment Lab",
  };
}

export function parseUsage(payload: unknown): AiUsage {
  const usage = (payload as { usage?: Record<string, unknown> })?.usage ?? {};
  return {
    promptTokens:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null,
    totalTokens:
      typeof usage.total_tokens === "number" ? usage.total_tokens : null,
    model:
      typeof (payload as { model?: unknown }).model === "string"
        ? (payload as { model: string }).model
        : null,
    provider: null,
  };
}

export function chatCompletionsUrl(customBaseUrl?: string): string {
  const base =
    customBaseUrl?.trim() ||
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENROUTER_BASE_URL?.trim() ||
    OPENROUTER_BASE;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

export function transcriptionUrl(
  provider?: SttProvider,
  customBaseUrl?: string,
): string {
  const config = aiConfig();
  const currentProvider = provider || config.sttProvider;
  let base = customBaseUrl?.trim() || (provider ? "" : config.sttBaseUrl);
  if (!base) {
    if (currentProvider === "9router") {
      base = "http://127.0.0.1:20128/v1";
    } else {
      base = OPENROUTER_BASE;
    }
  }
  return `${base.replace(/\/+$/, "")}/audio/transcriptions`;
}
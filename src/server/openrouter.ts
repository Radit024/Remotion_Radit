import { aiConfig } from "./env";
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
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!key) {
    throw new ApiError("API_KEY_MISSING", "OPENROUTER_API_KEY belum dikonfigurasi; transkripsi dan saran AI tidak tersedia");
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

export function mapUpstreamStatus(status: number, body: string): AiError {
  const snippet = body.slice(0, 200);
  if (status === 401) {
    return new AiError("API_AUTH_FAILED", "OpenRouter menolak kunci API (401). Periksa OPENROUTER_API_KEY.");
  }
  if (status === 402) {
    return new AiError("API_PAYMENT_REQUIRED", "Kredit OpenRouter habis (402). Isi ulang atau gunakan kunci lain.");
  }
  if (status === 429) {
    return new AiError("API_RATE_LIMITED", "OpenRouter membatasi laju permintaan (429). Coba lagi beberapa saat.");
  }
  if (status === 503) {
    return new AiError("AI_UPSTREAM_ERROR", "OpenRouter sedang tidak tersedia (503). Coba lagi sebentar.");
  }
  return new AiError("AI_UPSTREAM_ERROR", `OpenRouter mengembalikan status ${status}: ${snippet}`);
}

export function isRetryable(error: unknown): boolean {
  return error instanceof AiError && (error.code === "API_RATE_LIMITED" || error.code === "AI_UPSTREAM_ERROR");
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiError("AI_UPSTREAM_ERROR", `Permintaan OpenRouter melebihi ${timeoutMs} ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new AiError("AI_UPSTREAM_ERROR", `Gagal menghubungi OpenRouter: ${message}`);
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
    promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
    totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
    model: typeof (payload as { model?: unknown }).model === "string"
      ? ((payload as { model: string }).model)
      : null,
    provider: null,
  };
}

export function chatCompletionsUrl(): string {
  return `${OPENROUTER_BASE}/chat/completions`;
}

export function transcriptionUrl(): string {
  return `${OPENROUTER_BASE}/audio/transcriptions`;
}
import { spawn } from "node:child_process";

export type RunToolOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBuffer?: number;
  cwd?: string;
};

export class ToolError extends Error {
  readonly code: string;
  readonly stderr: string;
  constructor(code: string, message: string, stderr = "") {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.stderr = stderr;
  }
}

export function spawnTool(command: string, args: string[]) {
  return spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runTool(
  command: string,
  args: string[],
  options: RunToolOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { timeoutMs = 120_000, signal, maxBuffer = 8 * 1024 * 1024, cwd } = options;
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawnTool>;
    try {
      child = spawnTool(command, args);
    } catch (error) {
      reject(new ToolError("DEPENDENCY_UNAVAILABLE", error instanceof Error ? error.message : String(error)));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };

    const killTree = () => {
      if (child.pid === undefined) return;
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            shell: false,
            windowsHide: true,
            stdio: "ignore",
          }).unref();
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        /* best effort */
      }
    };

    const onAbort = () => {
      aborted = true;
      killTree();
    };

    if (signal) {
      if (signal.aborted) {
        settled = true;
        reject(new ToolError("CANCELLED", "Proses dibatalkan"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ToolError("DEPENDENCY_UNAVAILABLE", error.message));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(new ToolError("CANCELLED", "Proses dibatalkan"));
        return;
      }
      if (timedOut) {
        reject(new ToolError("TOOL_TIMEOUT", `Proses ${command} melebihi batas waktu`));
        return;
      }
      if (code !== 0) {
        reject(new ToolError("TOOL_FAILED", `Proses ${command} gagal dengan kode ${code}`, stderr.trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
import "./runner";
import { ensureDataDirs } from "../server/env";
import { createWorker } from "../server/jobs";

async function main(): Promise<void> {
  ensureDataDirs();
  const worker = createWorker();
  worker.start();
  console.log("[worker] siap menerima job");

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] menerima ${signal}, menghentikan dengan aman`);
    void worker.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandled rejection:", reason instanceof Error ? reason.message : reason);
  });
}

void main();
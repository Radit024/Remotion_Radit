import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const configuredDataDir = process.env.DATA_DIR?.trim();
if (!configuredDataDir && (process.env.CI || process.env.VITEST || process.env.NODE_ENV === "test")) {
  throw new Error("[fixture] Set DATA_DIR to temporary storage for automated runs; .data fallback is manual only.");
}
const dataDir = configuredDataDir
  ? path.resolve(process.cwd(), configuredDataDir)
  : path.join(process.cwd(), ".data");
if (!configuredDataDir) {
  console.warn(`[fixture] Manual .data fallback: ${dataDir}`);
}
const targetDir = path.join(dataDir, "tmp");
fs.mkdirSync(targetDir, { recursive: true });
const targetFile = path.join(targetDir, "fixture-300s.mp4");

console.log("[fixture] Membuat video sintetis 300 detik dengan FFmpeg lavfi...");

const args = [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=duration=300:size=1280x720:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=300",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  targetFile,
];

const result = spawnSync("ffmpeg", args, {
  stdio: "inherit",
  windowsHide: true,
});

if (result.status !== 0) {
  console.error("[fixture] Gagal membuat fixture");
  process.exit(result.status ?? 1);
}

const stat = fs.statSync(targetFile);
console.log(`[fixture] Berhasil membuat fixture: ${targetFile} (${Math.round(stat.size / 1024 / 1024)} MiB)`);

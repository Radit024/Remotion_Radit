import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const targetDir = path.join(process.cwd(), ".data", "tmp");
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

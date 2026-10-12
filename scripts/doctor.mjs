import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function version(cmd: string): string {
  const result = spawnSync(cmd, ["-version"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return "tidak tersedia";
  const line = (result.stdout || result.stderr || "").split("\n")[0];
  return line.trim();
}

function toolAvailable(cmd: string): boolean {
  const result = spawnSync(cmd, ["-version"], { windowsHide: true });
  return !result.error && result.status === 0;
}

for (const cmd of ["ffmpeg", "ffprobe"]) {
  const ok = toolAvailable(cmd);
  checks.push({ name: cmd, ok, detail: version(cmd) });
}

if (fs.existsSync(path.join(process.cwd(), "node_modules", "next", "package.json"))) {
  checks.push({ name: "next", ok: true, detail: "terpasang" });
} else {
  checks.push({ name: "next", ok: false, detail: "node_modules belum lengkap" });
}

for (const pkg of [
  "remotion",
  "@remotion/player",
  "@remotion/bundler",
  "@remotion/renderer",
  "zod",
  "busboy",
  "lucide-react",
  "motion",
  "emoji-mart",
  "@emoji-mart/react",
  "@twemoji/api",
]) {
  const ok = fs.existsSync(path.join(process.cwd(), "node_modules", pkg));
  checks.push({ name: pkg, ok, detail: ok ? "terpasang" : "belum terpasang" });
}

for (const file of [
  "public/fonts/barlow-400.woff2",
  "public/fonts/barlow-500.woff2",
  "public/fonts/barlow-600.woff2",
  "public/fonts/barlow-700.woff2",
  "public/fonts/barlow-800.woff2",
  "public/fonts/barlow-condensed-800.woff2",
  "public/fonts/ibm-plex-mono-400.woff2",
  "public/fonts/ibm-plex-mono-500.woff2",
  "public/emoji/manifest.json",
]) {
  const ok = fs.existsSync(path.join(process.cwd(), file));
  checks.push({ name: file, ok, detail: ok ? "ada" : "tidak ada" });
}

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  process.stdout.write(`${check.ok ? "OK  " : "FAIL"} ${check.name} ${check.ok ? "" : `— ${check.detail}`}\n`);
}

if (failed > 0) {
  process.stdout.write(`\n${failed} pemeriksaan gagal dari ${checks.length}\n`);
  process.exit(1);
}
process.stdout.write(`\nSemua ${checks.length} pemeriksaan berhasil\n`);

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const checks = [];

function version(cmd) {
  const result = spawnSync(cmd, ["-version"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return "tidak tersedia";
  const line = (result.stdout || result.stderr || "").split("\n")[0];
  return line.trim();
}

function toolAvailable(cmd) {
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
  "motion",
  "@fortawesome/react-fontawesome",
  "@fortawesome/free-solid-svg-icons",
  "emoji-mart",
  "@emoji-mart/react",
  "@twemoji/api",
  "@fontsource/sora",
  "@fontsource/barlow-condensed",
  "@fontsource/ibm-plex-mono",
]) {
  const ok = fs.existsSync(path.join(process.cwd(), "node_modules", pkg));
  checks.push({ name: pkg, ok, detail: ok ? "terpasang" : "belum terpasang" });
}

for (const file of [
  "node_modules/@fontsource/sora/files/sora-latin-400-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2",
  "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
  "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
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

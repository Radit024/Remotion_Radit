import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const tmpDir = path.join(process.cwd(), ".data", "tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const fixturePath = path.join(tmpDir, "fixture-300s.mp4");

import http from "node:http";

if (!fs.existsSync(fixturePath)) {
  console.log("[smoke:render] Fixture belum ada, membuat fixture terlebih dahulu...");
  const create = spawnSync("node", ["scripts/create-fixture.mjs"], { stdio: "inherit" });
  if (create.status !== 0) process.exit(1);
}

const fileServer = http.createServer((req, res) => {
  const filePath = fixturePath;
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": total,
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

await new Promise((resolve) => fileServer.listen(0, "127.0.0.1", resolve));
const port = fileServer.address().port;
const sourceUrl = `http://127.0.0.1:${port}/fixture-300s.mp4`;

console.log("[smoke:render] Melakukan bundling composition video...");
const entry = path.join(process.cwd(), "src", "video", "index.ts");
const serveUrl = await bundle({
  entryPoint: entry,
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias || {}),
        "@": path.resolve(process.cwd(), "src"),
      },
    },
  }),
});

console.log(`[smoke:render] Bundle siap di ${serveUrl}`);

// 1. Light preset: range 2400 to 3300, moment 2952 (30.0s = 900 frames)
const lightEdit = {
  id: "smoke-light",
  revision: 1,
  assetId: "fixture",
  name: "Smoke Light",
  startFrame: 2400,
  endFrame: 3300,
  momentFrame: 2952,
  preset: "light",
  layout: "contain",
  focusX: 0.5,
  focusY: 0.5,
  captionY: 0.72,
  freezeFrames: 0,
  replayFrames: 0,
  captions: [{ id: "c1", startFrame: 2952, endFrame: 2982, text: "Momen Bagus!", speaker: null }],
  effects: [{ id: "e1", kind: "zoom", startFrame: 2952, endFrame: 2970, text: "", assetId: null, strength: 1.12 }],
};

const lightProps = { edit: lightEdit, sourceUrl, assetUrls: {} };
const lightComp = await selectComposition({ serveUrl, id: "FunnyMoment", inputProps: lightProps });
const lightOutput = path.join(tmpDir, "smoke-light.mp4");

console.log(`[smoke:render] Merender Light preset (durasi: ${lightComp.durationInFrames} frames)...`);
await renderMedia({
  codec: "h264",
  audioCodec: "aac",
  crf: 18,
  pixelFormat: "yuv420p",
  composition: lightComp,
  inputProps: lightProps,
  serveUrl,
  outputLocation: lightOutput,
  concurrency: 2,
  chromiumOptions: { gl: "swangle" },
});

console.log(`[smoke:render] Light preset selesai: ${lightOutput}`);

// 2. Meme preset: freeze 12, replay 36 (31.6s = 948 frames)
const memeEdit = {
  id: "smoke-meme",
  revision: 1,
  assetId: "fixture",
  name: "Smoke Meme",
  startFrame: 2400,
  endFrame: 3300,
  momentFrame: 2952,
  preset: "meme",
  layout: "contain",
  focusX: 0.5,
  focusY: 0.5,
  captionY: 0.72,
  freezeFrames: 12,
  replayFrames: 36,
  captions: [{ id: "c1", startFrame: 2952, endFrame: 2982, text: "Jatuh!", speaker: null }],
  effects: [
    { id: "e1", kind: "zoom", startFrame: 2952, endFrame: 2976, text: "", assetId: null, strength: 1.3 },
    { id: "e2", kind: "shake", startFrame: 2952, endFrame: 2962, text: "", assetId: null, strength: 1 },
  ],
};

const memeProps = { edit: memeEdit, sourceUrl, assetUrls: {} };
const memeComp = await selectComposition({ serveUrl, id: "FunnyMoment", inputProps: memeProps });
const memeOutput = path.join(tmpDir, "smoke-meme.mp4");

console.log(`[smoke:render] Merender Meme preset (durasi: ${memeComp.durationInFrames} frames)...`);
await renderMedia({
  codec: "h264",
  audioCodec: "aac",
  crf: 18,
  pixelFormat: "yuv420p",
  composition: memeComp,
  inputProps: memeProps,
  serveUrl,
  outputLocation: memeOutput,
  concurrency: 2,
  chromiumOptions: { gl: "swangle" },
});

console.log(`[smoke:render] Meme preset selesai: ${memeOutput}`);

// Verify outputs with ffprobe
for (const [name, target, expectedDuration] of [
  ["Light", lightOutput, 30.0],
  ["Meme", memeOutput, 31.6],
]) {
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height,codec_name:format=duration",
    "-of",
    "json",
    target,
  ], { encoding: "utf8" });

  const data = JSON.parse(probe.stdout);
  const video = data.streams.find((s) => s.codec_name === "h264");
  const duration = Number(data.format.duration);

  console.log(`[smoke:render] Verifikasi ${name}: ${video.width}x${video.height}, durasi: ${duration.toFixed(1)}s (target: ${expectedDuration}s)`);
  if (video.width !== 1080 || video.height !== 1920) {
    console.error(`[smoke:render] Dimensi video ${name} salah!`);
    process.exit(1);
  }
}

fileServer.close();
console.log("[smoke:render] Uji render smoke kedua preset BERHASIL!");

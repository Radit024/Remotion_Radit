import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Output root honors DATA_DIR for automation; `.data` is an intentional manual fallback.
const configuredDataDir = process.env.DATA_DIR?.trim();
if (!configuredDataDir && (process.env.CI || process.env.VITEST || process.env.NODE_ENV === "test")) {
  throw new Error("[smoke:render] DATA_DIR required for automated runs; .data fallback is manual only.");
}
const dataDir = configuredDataDir
  ? path.resolve(process.cwd(), configuredDataDir)
  : path.join(process.cwd(), ".data");
if (!configuredDataDir) {
  console.warn(`[smoke:render] Manual .data fallback: ${dataDir}`);
}

const tmpDir = path.join(dataDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const fixturePath = path.join(tmpDir, "fixture-300s.mp4");

if (!fs.existsSync(fixturePath)) {
  console.log("[smoke:render] Fixture belum ada, membuat fixture terlebih dahulu...");
  const create = spawnSync("node", ["scripts/create-fixture.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATA_DIR: dataDir },
  });
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

const presets = [
  {
    preset: "light",
    edit: {
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
    },
    expectedDuration: 30.0,
  },
  {
    preset: "meme",
    edit: {
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
    },
    expectedDuration: 31.6,
  },
];

for (const item of presets) {
  const inputProps = { edit: item.edit, sourceUrl, assetUrls: {} };
  const composition = await selectComposition({ serveUrl, id: "FunnyMoment", inputProps });
  const output = path.join(tmpDir, `smoke-${item.preset}.mp4`);

  console.log(`[smoke:render] Merender ${item.preset} preset (durasi: ${composition.durationInFrames} frames)...`);
  await renderMedia({
    codec: "h264",
    audioCodec: "aac",
    crf: 18,
    pixelFormat: "yuv420p",
    composition,
    inputProps,
    serveUrl,
    outputLocation: output,
    concurrency: 2,
    chromiumOptions: { gl: "swangle" },
  });
  console.log(`[smoke:render] ${item.preset} preset selesai: ${output}`);
}

// Verify outputs with ffprobe
for (const item of presets) {
  const target = path.join(tmpDir, `smoke-${item.preset}.mp4`);
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

  console.log(`[smoke:render] Verifikasi ${item.preset}: ${video.width}x${video.height}, durasi: ${duration.toFixed(1)}s (target: ${item.expectedDuration}s)`);
  if (video.width !== 1080 || video.height !== 1920) {
    console.error(`[smoke:render] Dimensi video ${item.preset} salah!`);
    process.exit(1);
  }
}

fileServer.close();
console.log("[smoke:render] Uji render smoke kedua preset BERHASIL!");

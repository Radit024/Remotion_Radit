import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dirs, ensureDataDirs } from "../src/server/env";
import { importAssetFromRequest, createPreviewProxy, materializeEmojiAssets, readAssetManifest, toPublicAsset, writeAssetManifest, classifyUpload, type StoredAsset } from "../src/server/assets";
import { withLock } from "../src/server/projects";
import { GET } from "../src/app/api/assets/route";
import { inspectMedia } from "../src/server/media";
import { runTool } from "../src/server/process";

const bankRoot = vi.hoisted(() => ({ directory: "" }));
vi.mock("../src/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/env")>();
  return { ...actual, get projectRoot() { return bankRoot.directory; } };
});
vi.mock("../src/server/media", () => ({ inspectMedia: vi.fn(), needsPreviewProxy: vi.fn() }));
vi.mock("../src/server/process", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/server/process")>(), runTool: vi.fn(),
}));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6PncAAAAASUVORK5CYII=", "base64");
const sha256 = createHash("sha256").update(png).digest("hex");
const reactionCodes = ["1f602", "1f923", "1f480", "1f62d", "1f62e", "1f621", "1f525", "1f44f"];
const fixtureManifest = () => ({
  license: "CC-BY-4.0",
  emojis: reactionCodes.map((codepoint, index) => ({
    id: codepoint, codepoint, name: `Reaksi ${index + 1}`, file: `${codepoint}.png`, sha256,
    source: "https://github.com/jdecked/twemoji/tree/v17.0.3/assets", license: "CC-BY-4.0",
  })),
});
let directory: string;
function writeBank(manifest: unknown = fixtureManifest()) {
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest));
}
function publishVideo(): StoredAsset {
  const id = randomUUID();
  const video: StoredAsset = {
    id, kind: "video", name: "source.mp4", filename: `${id}.mp4`, relativePath: `${id}.mp4`,
    mimeType: "video/mp4", sizeBytes: 12, codec: "h264", frameRate: 30, proxyRelativePath: null,
    durationFrames: 300, width: 1920, height: 1080, hasAudio: true, previewReady: true, createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dirs().assets, video.relativePath), "source-bytes");
  writeAssetManifest({ ...readAssetManifest(), [id]: video });
  return video;
}
function uploadRequest(): Request {
  const data = new FormData();
  data.append("file", new Blob([png], { type: "image/png" }), "uploaded.png");
  return new Request("http://127.0.0.1:3000/api/assets", { method: "POST", body: data });
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureDataDirs();
  for (const file of fs.readdirSync(dirs().assets)) fs.rmSync(path.join(dirs().assets, file), { recursive: true, force: true });
  bankRoot.directory = fs.mkdtempSync(path.join(dirs().tmp, "emoji-bank-"));
  directory = path.join(bankRoot.directory, "public", "emoji");
  fs.mkdirSync(directory, { recursive: true });
  for (const code of reactionCodes) fs.writeFileSync(path.join(directory, `${code}.png`), png);
  writeBank();
  writeAssetManifest({});
  vi.mocked(inspectMedia).mockImplementation(async (_path, kind) => ({
    kind, codec: kind === "image" ? "png" : "h264", width: 1, height: 1,
    durationSeconds: kind === "image" ? 0 : 10, durationFrames: kind === "image" ? 0 : 300,
    hasAudio: kind === "video", frameRate: kind === "video" ? 30 : null,
  }));
  vi.mocked(runTool).mockImplementation(async (_tool, args) => {
    fs.writeFileSync(args[args.length - 1], "proxy-bytes");
    return { stdout: "", stderr: "" };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("server-owned local emoji materialization", () => {
  it("publishes eight ordinary public image assets with stable UUID mapping and exact local bytes", async () => {
    const first = await materializeEmojiAssets();
    expect(first).toHaveLength(8);
    for (const [index, asset] of first.entries()) {
      expect(asset.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      expect(asset.id).not.toBe(reactionCodes[index]);
      expect(asset).toMatchObject({ kind: "image", name: `Reaksi: Reaksi ${index + 1}`, mimeType: "image/png", width: 1, height: 1, durationFrames: 0, previewReady: true, emojiManifestId: reactionCodes[index], emojiSha256: sha256 });
      expect(fs.readFileSync(path.join(dirs().assets, asset.relativePath))).toEqual(png);
      const publicAsset = toPublicAsset(asset);
      expect(publicAsset).not.toHaveProperty("relativePath");
      expect(publicAsset).not.toHaveProperty("emojiManifestId");
      expect(publicAsset).not.toHaveProperty("emojiSha256");
    }
    const manifestBytes = fs.readFileSync(path.join(dirs().assets, "assets.json"));
    expect((await materializeEmojiAssets()).map((asset) => asset.id)).toEqual(first.map((asset) => asset.id));
    expect(fs.readFileSync(path.join(dirs().assets, "assets.json"))).toEqual(manifestBytes);
    expect(inspectMedia).not.toHaveBeenCalled();
    expect(runTool).not.toHaveBeenCalled();
  });

  it("is idempotent under concurrent requests and later manifest ID/name changes", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => materializeEmojiAssets()));
    for (const result of results) expect(result.map((asset) => asset.id)).toEqual(results[0].map((asset) => asset.id));
    expect(Object.keys(readAssetManifest())).toHaveLength(8);
    const renamed = fixtureManifest();
    renamed.emojis[0].name = "Tertawa";
    renamed.emojis[0].id = "emoji-1f602";
    writeBank(renamed);
    const next = await materializeEmojiAssets();
    expect(next[0].id).toBe(results[0][0].id);
    expect(next[0].name).toBe("Reaksi: Tertawa");
    expect(Object.keys(readAssetManifest())).toHaveLength(8);
  });

  it("can reuse a legacy name-and-hash mapping without converting an unrelated upload", async () => {
    const result = await materializeEmojiAssets();
    const manifest = readAssetManifest();
    delete manifest[result[0].id].emojiManifestId;
    delete manifest[result[0].id].emojiSha256;
    writeAssetManifest(manifest);
    const next = await materializeEmojiAssets();
    expect(next[0].id).toBe(result[0].id);
    expect(next[0].emojiManifestId).toBe(reactionCodes[0]);
  });

  it("restores a missing owned copy with the same UUID, but never overwrites corrupt existing bytes", async () => {
    const first = await materializeEmojiAssets();
    const file = path.join(dirs().assets, first[0].relativePath);
    fs.rmSync(file);
    expect((await materializeEmojiAssets())[0].id).toBe(first[0].id);
    expect(fs.readFileSync(file)).toEqual(png);
    fs.writeFileSync(file, "corrupt-owned-image");
    await expect(materializeEmojiAssets()).rejects.toThrow(/rusak; tidak ditimpa/);
    expect(fs.readFileSync(file, "utf8")).toBe("corrupt-owned-image");
  });

  it("shares the existing lock with both uploads and proxy manifest publication", async () => {
    const video = publishVideo();
    let release!: () => void;
    const held = withLock("asset-manifest", () => new Promise<void>((resolve) => { release = resolve; }));
    const importing = materializeEmojiAssets();
    const uploading = importAssetFromRequest(uploadRequest());
    const proxying = createPreviewProxy(video);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(readAssetManifest()).toEqual({ [video.id]: video });
    } finally {
      release();
      await held;
    }
    const [emoji, { asset: upload }, proxy] = await Promise.all([importing, uploading, proxying]);
    const manifest = readAssetManifest();
    expect(Object.keys(manifest)).toHaveLength(10);
    expect(manifest[upload.id].name).toBe("uploaded.png");
    expect(manifest[video.id].proxyRelativePath).toBe(proxy.proxyRelativePath);
    expect(manifest[video.id].relativePath).toBe(`${video.id}.proxy.mp4`);
    for (const asset of emoji) expect(manifest[asset.id]).toEqual(asset);
    expect(fs.readFileSync(path.join(dirs().assets, video.relativePath), "utf8")).toBe("source-bytes");
  });

  it("imports the published bank from the real fixed path into isolated test storage", async () => {
    bankRoot.directory = process.cwd();
    const result = await materializeEmojiAssets();
    expect(result).toHaveLength(8);
    expect(result.map((asset) => asset.emojiManifestId)).toEqual(reactionCodes);
    expect((await materializeEmojiAssets()).map((asset) => asset.id)).toEqual(result.map((asset) => asset.id));
    for (const asset of result) {
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dirs().assets, asset.relativePath))).digest("hex");
      expect(hash).toBe(asset.emojiSha256);
      expect(asset.kind).toBe("image");
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.name.startsWith("Reaksi: ")).toBe(true);
    }
    expect(runTool).not.toHaveBeenCalled();
    expect(inspectMedia).not.toHaveBeenCalled();
  });

  it("assets GET awaits materialization and only exposes ordinary public assets without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request("http://127.0.0.1:3000/api/assets", { headers: { host: "127.0.0.1:3000" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.assets).toHaveLength(8);
    expect(body.assets[0]).toMatchObject({ kind: "image", name: "Reaksi: Reaksi 1" });
    expect(JSON.stringify(body)).not.toMatch(/relativePath|filename|emojiManifestId|emojiSha256/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["../outside.png", "..\\outside.png", "/outside.png", "C:\\outside.png", "https://remote.test/image.png", "reaction.svg", ".hidden.png", "image..png"])("rejects unsafe bank file %s before writing anything", async (file) => {
    const manifest = fixtureManifest();
    manifest.emojis[0].file = file;
    writeBank(manifest);
    await expect(materializeEmojiAssets()).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(readAssetManifest()).toEqual({});
    expect(fs.readdirSync(dirs().assets)).toEqual(["assets.json"]);
  });

  it.each(["source", "license", "sha256"])("requires valid %s metadata", async (field) => {
    const manifest = fixtureManifest();
    (manifest.emojis[0] as unknown as Record<string, string>)[field] = "";
    writeBank(manifest);
    await expect(materializeEmojiAssets()).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(readAssetManifest()).toEqual({});
  });

  it("validates the entire bank first; a late hash mismatch leaves no partial imports", async () => {
    fs.writeFileSync(path.join(directory, `${reactionCodes[7]}.png`), "modified-png");
    await expect(materializeEmojiAssets()).rejects.toThrow(/hash 1f44f tidak cocok/);
    expect(readAssetManifest()).toEqual({});
    expect(fs.readdirSync(dirs().assets)).toEqual(["assets.json"]);
  });

  it("rejects non-PNG bytes even when their hash matches", async () => {
    const bytes = Buffer.from("<svg>not a PNG</svg>");
    const manifest = fixtureManifest();
    manifest.emojis[0].sha256 = createHash("sha256").update(bytes).digest("hex");
    writeBank(manifest);
    fs.writeFileSync(path.join(directory, manifest.emojis[0].file), bytes);
    await expect(materializeEmojiAssets()).rejects.toThrow(/bukan PNG/);
    expect(() => classifyUpload("reaction.svg", "image/svg+xml")).toThrow();
  });

  it("rejects duplicate manifest identity", async () => {
    const manifest = fixtureManifest();
    manifest.emojis[7].id = manifest.emojis[0].id;
    writeBank(manifest);
    await expect(materializeEmojiAssets()).rejects.toThrow(/duplikat/);
    expect(readAssetManifest()).toEqual({});
  });

  it.each(["empty", "missing-file", "missing-manifest", "broken-json"])("reports %s bank failures visibly without losing uploaded metadata", async (state) => {
    const video = publishVideo();
    if (state === "empty") writeBank({ emojis: [] });
    if (state === "missing-file") fs.rmSync(path.join(directory, `${reactionCodes[0]}.png`));
    if (state === "missing-manifest") fs.rmSync(path.join(directory, "manifest.json"));
    if (state === "broken-json") fs.writeFileSync(path.join(directory, "manifest.json"), "private-not-json");
    const response = await GET(new Request("http://127.0.0.1:3000/api/assets", { headers: { host: "127.0.0.1:3000" } }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(body.error.message).toContain("Bank emoji lokal");
    expect(body.error.message).not.toContain(directory);
    expect(readAssetManifest()).toEqual({ [video.id]: video });
  });
});

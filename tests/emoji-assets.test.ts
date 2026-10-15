import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION,
  EMOJI_DIR,
  EMOJI_MANIFEST,
  LICENSE_SHA256,
  PNG_SIZE,
  TWEMOJI,
  prepareEmojiAssets,
  readEmojiFile,
} from "../scripts/prepare-emoji-assets.mjs";
import { validateEmojiManifest, verifyAssets, verifyEmojiAssets } from "../scripts/verify-assets.mjs";

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const unsafePaths = [
  "../outside.png", "..\\outside.png", "/tmp/outside.png", "E:\\outside.png",
  "//server/share.png", "sources/1f602.png", "%2e%2e%2foutside.png",
  "1f602.png/../../outside.png", "1f602.png\0", "", ".", "..",
];
let fixtureDir: string;

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, "manifest.json"), "utf8")) as {
    version: string;
    license: string;
    licenseFile: string;
    attributionFile: string;
    emojis: Array<{ id: string; codepoint: string; name: string; file: string; sha256: string; source: string; license: string }>;
  };
}

function writeManifest(manifest: ReturnType<typeof loadManifest>) {
  fs.writeFileSync(path.join(fixtureDir, "manifest.json"), JSON.stringify(manifest));
}

function snapshotFiles(directory: string): Record<string, { sha256: string; mtimeMs: number }> {
  const snapshot: Record<string, { sha256: string; mtimeMs: number }> = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(snapshotFiles(filename))) snapshot[`${entry.name}/${key}`] = value;
    } else {
      snapshot[entry.name] = { sha256: digest(fs.readFileSync(filename)), mtimeMs: fs.statSync(filename).mtimeMs };
    }
  }
  return snapshot;
}

beforeEach(() => {
  // Never import server storage or use a user's DATA_DIR for asset fixtures.
  assert.ok(process.env.DATA_DIR, "tests/setup.ts must establish isolated storage first");
  assert.notEqual(path.resolve(process.env.DATA_DIR), path.resolve(process.cwd(), ".data"));
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "takefield-emoji-assets-"));
  fs.cpSync(EMOJI_DIR, fixtureDir, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  assert.equal(path.dirname(fixtureDir), path.resolve(os.tmpdir()));
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe("Pinned local Twemoji bank", () => {
  it("contains exactly the eight reactions with the fixed integration fields", () => {
    const manifest = loadManifest();
    expect(validateEmojiManifest(manifest)).toEqual(EMOJI_MANIFEST);
    expect(manifest.emojis.map((entry) => String.fromCodePoint(parseInt(entry.codepoint, 16))))
      .toEqual(["😂", "🤣", "💀", "😭", "😮", "😡", "🔥", "👏"]);
    expect(new Set(manifest.emojis.map((entry) => entry.id)).size).toBe(8);
    expect(new Set(manifest.emojis.map((entry) => entry.file)).size).toBe(8);
    expect(fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".png")).sort())
      .toEqual(manifest.emojis.map((entry) => entry.file).sort());
    for (const entry of manifest.emojis) {
      expect(Object.keys(entry).sort()).toEqual(["codepoint", "file", "id", "license", "name", "sha256", "source"]);
      expect(entry.file).toBe(`${entry.codepoint}.png`);
      expect(entry.name.trim()).not.toBe("");
      expect(entry.source).toBe(`https://raw.githubusercontent.com/jdecked/twemoji/${TWEMOJI.commit}/assets/svg/${entry.codepoint}.svg`);
      expect(entry.license).toBe("CC-BY-4.0");
    }
  });

  it("checks actual file hashes and decodes transparent 512px PNGs, not SVGs or glyphs", async () => {
    expect(verifyEmojiAssets(fixtureDir)).toEqual({ count: 8 });
    for (const entry of loadManifest().emojis) {
      const bytes = fs.readFileSync(path.join(fixtureDir, entry.file));
      expect(digest(bytes)).toBe(entry.sha256);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const metadata = await sharp(bytes).metadata();
      expect(metadata).toMatchObject({ format: "png", width: PNG_SIZE, height: PNG_SIZE, hasAlpha: true });
      const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data.length).toBe(PNG_SIZE * PNG_SIZE * 4);
      expect(data[3]).toBe(0);
      expect(data.some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
    }
  });

  it("retains the exact upstream graphics license, attribution, provenance, and conversion notice", () => {
    const license = fs.readFileSync(path.join(fixtureDir, "LICENSE-GRAPHICS"));
    expect(digest(license)).toBe(LICENSE_SHA256);
    expect(license.toString("utf8")).toContain("Creative Commons Attribution 4.0 International Public License");
    const attribution = fs.readFileSync(path.join(fixtureDir, "ATTRIBUTION.txt"), "utf8");
    expect(attribution).toBe(ATTRIBUTION);
    expect(attribution).toContain("Twitter");
    expect(attribution).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(attribution).toContain(TWEMOJI.commit);
    expect(attribution).toContain("rasterized");
    for (const entry of loadManifest().emojis) expect(attribution).toContain(entry.source);
  });

  it.each(["1f602.png", "sources/1f602.svg", "LICENSE-GRAPHICS", "ATTRIBUTION.txt", "manifest.json"])
    ("fails verification when required file %s is missing", (filename) => {
      fs.unlinkSync(path.join(fixtureDir, filename));
      expect(() => verifyEmojiAssets(fixtureDir)).toThrow();
    });

  it.each(["1f602.png", "sources/1f602.svg", "LICENSE-GRAPHICS"])
    ("rejects corrupted pinned bytes: %s", (filename) => {
      fs.appendFileSync(path.join(fixtureDir, filename), "tampered");
      expect(() => verifyEmojiAssets(fixtureDir)).toThrow(/SHA-256 mismatch/);
    });

  it("rejects an altered attribution", () => {
    fs.writeFileSync(path.join(fixtureDir, "ATTRIBUTION.txt"), "Twemoji");
    expect(() => verifyEmojiAssets(fixtureDir)).toThrow(/attribution/);
  });

  it.each(["emojis", "licenseFile", "attributionFile"] as const)("rejects traversal in %s before file reads", (field) => {
    for (const filename of unsafePaths) {
      const manifest = loadManifest();
      if (field === "emojis") manifest.emojis[0].file = filename;
      else manifest[field] = filename;
      expect(() => validateEmojiManifest(manifest)).toThrow(/asset path/i);
    }
  });

  it.each(unsafePaths)("rejects unsafe local source/file path %j", (filename) => {
    expect(() => readEmojiFile(fixtureDir, filename)).toThrow(/asset path|ENOENT/);
  });

  it("rejects source directory junctions/symlinks even when linked bytes have the right hashes", () => {
    const original = path.join(fixtureDir, "original-sources");
    fs.renameSync(path.join(fixtureDir, "sources"), original);
    fs.symlinkSync(original, path.join(fixtureDir, "sources"), "junction");
    expect(() => verifyEmojiAssets(fixtureDir)).toThrow(/Symlink asset path/);
    fs.unlinkSync(path.join(fixtureDir, "sources"));
  });

  it("rejects corrupted PNGs even if a modified manifest declares their new hash", () => {
    const manifest = loadManifest();
    const filename = path.join(fixtureDir, manifest.emojis[0].file);
    fs.writeFileSync(filename, "not a PNG");
    manifest.emojis[0].sha256 = digest(fs.readFileSync(filename));
    writeManifest(manifest);
    expect(() => verifyEmojiAssets(fixtureDir)).toThrow(/fixed, pinned bank/);
  });

  it("rejects extra/duplicate entries, renamed files, remote/latest sources, and false licensing", () => {
    const mutations = [
      (manifest: ReturnType<typeof loadManifest>) => manifest.emojis.push(manifest.emojis[0]),
      (manifest: ReturnType<typeof loadManifest>) => manifest.emojis.pop(),
      (manifest: ReturnType<typeof loadManifest>) => { manifest.emojis[1] = manifest.emojis[0]; },
      (manifest: ReturnType<typeof loadManifest>) => { manifest.emojis[0].file = "unowned.png"; },
      (manifest: ReturnType<typeof loadManifest>) => { manifest.emojis[0].source = "https://example.com/fake.svg"; },
      (manifest: ReturnType<typeof loadManifest>) => { manifest.emojis[0].source = manifest.emojis[0].source.replace(TWEMOJI.commit, "latest"); },
      (manifest: ReturnType<typeof loadManifest>) => { manifest.emojis[0].license = "MIT"; },
      (manifest: ReturnType<typeof loadManifest>) => { manifest.license = "MIT"; },
    ];
    for (const mutate of mutations) {
      const manifest = loadManifest();
      mutate(manifest);
      expect(() => validateEmojiManifest(manifest)).toThrow(/fixed, pinned bank/);
    }
  });

  it("keeps the existing font checks in verify:assets", () => {
    expect(verifyAssets()).toEqual({ fonts: 8, emojis: 8 });
    expect(() => verifyAssets(fixtureDir)).toThrow(/File font package hilang/);
  });
});

describe("Offline emoji preparation", () => {
  it("is byte- and mtime-idempotent, offline, and independent of DATA_DIR", async () => {
    const dataDir = path.join(fixtureDir, "user-data-sentinel");
    fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, "keep.txt"), "do not touch");
    vi.stubEnv("DATA_DIR", dataDir);
    const fetch = vi.fn(() => { throw new Error("No network allowed during preparation or verification"); });
    vi.stubGlobal("fetch", fetch);
    const before = snapshotFiles(fixtureDir);
    expect(await prepareEmojiAssets(fixtureDir)).toEqual({ count: 8, written: 0 });
    expect(await prepareEmojiAssets(fixtureDir)).toEqual({ count: 8, written: 0 });
    expect(verifyEmojiAssets(fixtureDir)).toEqual({ count: 8 });
    expect(snapshotFiles(fixtureDir)).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    expect(fs.readdirSync(dataDir)).toEqual(["keep.txt"]);
  });

  it("rebuilds all eight missing PNGs, manifest, and attribution from vendored SVGs offline", async () => {
    for (const entry of loadManifest().emojis) fs.unlinkSync(path.join(fixtureDir, entry.file));
    fs.unlinkSync(path.join(fixtureDir, "manifest.json"));
    fs.unlinkSync(path.join(fixtureDir, "ATTRIBUTION.txt"));
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("offline"); }));
    expect(await prepareEmojiAssets(fixtureDir)).toEqual({ count: 8, written: 10 });
    expect(verifyEmojiAssets(fixtureDir)).toEqual({ count: 8 });
    expect(await prepareEmojiAssets(fixtureDir)).toEqual({ count: 8, written: 0 });
  });

  it("repairs a corrupted fixed PNG without changing or blessing its pinned hash", async () => {
    const manifestBefore = fs.readFileSync(path.join(fixtureDir, "manifest.json"));
    fs.writeFileSync(path.join(fixtureDir, "1f602.png"), "bad bytes");
    expect(await prepareEmojiAssets(fixtureDir)).toEqual({ count: 8, written: 1 });
    expect(fs.readFileSync(path.join(fixtureDir, "manifest.json"))).toEqual(manifestBefore);
    expect(verifyEmojiAssets(fixtureDir)).toEqual({ count: 8 });
  });

  it.each(["sources/1f602.svg", "LICENSE-GRAPHICS"])("refuses untrusted preparation input %s without writing outputs", async (filename) => {
    fs.appendFileSync(path.join(fixtureDir, filename), "tampered");
    const before = snapshotFiles(fixtureDir);
    await expect(prepareEmojiAssets(fixtureDir)).rejects.toThrow(/SHA-256 mismatch/);
    expect(snapshotFiles(fixtureDir)).toEqual(before);
  });
});

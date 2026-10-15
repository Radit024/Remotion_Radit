import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTRIBUTION,
  EMOJI_DIR,
  EMOJI_MANIFEST,
  LICENSE_SHA256,
  PNG_SIZE,
  PROJECT_ROOT,
  REACTIONS,
  assertSafeFilename,
  readEmojiFile,
  readPinnedEmojiFile,
} from "./prepare-emoji-assets.mjs";

const fonts = [
  "node_modules/@fontsource/sora/files/sora-latin-400-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-500-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-600-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-800-normal.woff2",
  "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
  "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
];

export function validateEmojiManifest(manifest) {
  assert.ok(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Emoji manifest must be an object");
  assert.ok(Array.isArray(manifest.emojis), "Emoji manifest must contain an emojis array");
  assertSafeFilename(manifest.licenseFile);
  assertSafeFilename(manifest.attributionFile);
  for (const entry of manifest.emojis) {
    assert.ok(entry && typeof entry === "object", "Invalid emoji manifest entry");
    assertSafeFilename(entry.file);
  }
  assert.deepStrictEqual(manifest, EMOJI_MANIFEST, "Emoji manifest differs from the fixed, pinned bank");
  return manifest;
}

export function verifyEmojiAssets(emojiDir = EMOJI_DIR) {
  const manifest = validateEmojiManifest(JSON.parse(readEmojiFile(emojiDir, "manifest.json").toString("utf8")));
  readPinnedEmojiFile(emojiDir, manifest.licenseFile, LICENSE_SHA256);
  assert.equal(readEmojiFile(emojiDir, manifest.attributionFile).toString("utf8"), ATTRIBUTION, "Twemoji attribution missing or changed");
  for (const [index, entry] of manifest.emojis.entries()) {
    readPinnedEmojiFile(emojiDir, `sources/${entry.codepoint}.svg`, REACTIONS[index].sourceSha256);
    const bytes = readPinnedEmojiFile(emojiDir, entry.file, entry.sha256);
    assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Not a PNG: ${entry.file}`);
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR", `Missing PNG header: ${entry.file}`);
    assert.equal(bytes.readUInt32BE(16), PNG_SIZE, `Unexpected PNG width: ${entry.file}`);
    assert.equal(bytes.readUInt32BE(20), PNG_SIZE, `Unexpected PNG height: ${entry.file}`);
    assert.equal(bytes[24], 8, `Unexpected PNG bit depth: ${entry.file}`);
    assert.equal(bytes[25], 6, `PNG must be RGBA: ${entry.file}`);
  }
  return { count: manifest.emojis.length };
}

export function verifyAssets(projectRoot = PROJECT_ROOT) {
  const missingFonts = fonts.filter((filename) => {
    try {
      return !fs.statSync(path.join(projectRoot, filename)).isFile();
    } catch (error) {
      if (error.code === "ENOENT") return true;
      throw error;
    }
  });
  assert.equal(missingFonts.length, 0, `File font package hilang: ${missingFonts.join(", ")}`);
  const emojis = verifyEmojiAssets(path.join(projectRoot, "public", "emoji"));
  return { fonts: fonts.length, emojis: emojis.count };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyAssets();
    console.log(`[verify:assets] ${result.fonts} berkas font @fontsource lengkap (tanpa file di public/). ${result.emojis} PNG Twemoji, hash sumber, manifest, lisensi, dan attribution valid (offline).`);
  } catch (error) {
    console.error(`[verify:assets] ${error.message}`);
    process.exitCode = 1;
  }
}

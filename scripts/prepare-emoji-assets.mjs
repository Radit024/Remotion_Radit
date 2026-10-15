import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EMOJI_DIR = path.join(PROJECT_ROOT, "public", "emoji");
export const PNG_SIZE = 512;
export const TWEMOJI = Object.freeze({
  repository: "https://github.com/jdecked/twemoji",
  tag: "v17.0.3",
  commit: "b6b55fef1e8636b540a6d016a4729ca8cdf2e60b",
});
const sourceBase = `https://raw.githubusercontent.com/jdecked/twemoji/${TWEMOJI.commit}`;

// Both hashes are pinned independently of the generated manifest. Never bless new bytes on rerun.
export const REACTIONS = Object.freeze([
  { id: "joy", codepoint: "1f602", name: "Tertawa sampai menangis", sha256: "eb12f849bfef3b0deec5b019248ab2a58bbd1d876a83ab8796afb338811ad918", sourceSha256: "1752c287f6fbbb65e1c982399584bbc9b1e0c46f0dc181cda9b8028dc60c4c01" },
  { id: "rofl", codepoint: "1f923", name: "Tertawa terguling", sha256: "4fef2b8bbdf88a5d1321cdc08a11301add5ecb6b2d5a25af7515821b1b9be837", sourceSha256: "cbd192d59e571778d577df96be003f18e5520c355a0d8d48576aa83a040d3e10" },
  { id: "skull", codepoint: "1f480", name: "Tengkorak", sha256: "a51f08dfa9ebd192fbcbf7da7bd2f675b95227491dcb6b417fce19cdf81c9e9c", sourceSha256: "5b60b847389fd7e41afd366c679320a8eb234ea95333e2d803230d93205aee52" },
  { id: "sob", codepoint: "1f62d", name: "Menangis keras", sha256: "e6f6daa61fe5abf4e5b4580778eba1b023f9ba3101daf0920567ac7f11efa296", sourceSha256: "d0333b5cb416ad6545055766fc8128566874ab5ead272e5a691a24704048f077" },
  { id: "open-mouth", codepoint: "1f62e", name: "Terkejut", sha256: "83f78f65f96aaeb54a76a0a763ddb629dac2f7ac33f9966e88c0a3135fb633aa", sourceSha256: "4050b8f2a75f5e63a120d6337befbf184490bb39498d3fb66f70f15d4a921691" },
  { id: "rage", codepoint: "1f621", name: "Marah", sha256: "a9debafb75a502663800a516355125e387625e2b53d24fa1fd7117501f9c6d39", sourceSha256: "26ff86c1655b7c86feda5a7ce77d55cbebfd346fcc341e8184f702e49eb36314" },
  { id: "fire", codepoint: "1f525", name: "Api", sha256: "b0ca9628471938b41957d1c3a99d44620235515f2a05614391605b4974339c01", sourceSha256: "4fa646a4dbc10513ddeb70561789483638faf456e15186f4eb7291c5c455cbb6" },
  { id: "clap", codepoint: "1f44f", name: "Tepuk tangan", sha256: "21f4c43b6ad8e8ba00ffa546bf53b0cebcf5cb4c1ab54b7beec9e16ec391c93d", sourceSha256: "9c38198544d25668f7e68c0fbd77a35cb3dfa6ae38df6760ab7616c111a7e007" },
].map((reaction) => Object.freeze(reaction)));

export const LICENSE_SHA256 = "8ae9438818c26e4873b91d8c6ad620526c011e27e125677f13031eda903f007c";
const credit = "Twemoji graphics by Twitter and contributors, maintained by Jason Sofonia and Justine De Caires, licensed under CC BY 4.0.";
export const EMOJI_MANIFEST = Object.freeze({
  version: "1.0.0",
  name: "twemoji-local-manifest",
  license: "CC-BY-4.0",
  licenseFile: "LICENSE-GRAPHICS",
  attribution: credit,
  attributionFile: "ATTRIBUTION.txt",
  provenance: TWEMOJI,
  emojis: Object.freeze(REACTIONS.map(({ id, codepoint, name, sha256 }) => Object.freeze({
    id,
    codepoint,
    name,
    file: `${codepoint}.png`,
    sha256,
    source: `${sourceBase}/assets/svg/${codepoint}.svg`,
    license: "CC-BY-4.0",
  }))),
});

export const ATTRIBUTION = `${credit}
Copyright (c) 2014–2021 Twitter
Copyright (c) 2022–present Jason Sofonia & Justine De Caires

Official project: ${TWEMOJI.repository}
Release: ${TWEMOJI.tag}
Pinned commit: ${TWEMOJI.commit}
Graphics license: Creative Commons Attribution 4.0 International (CC-BY-4.0)
License URL: https://creativecommons.org/licenses/by/4.0/
Full license: LICENSE-GRAPHICS (unmodified upstream text)
Pinned license source: ${sourceBase}/LICENSE-GRAPHICS

Changes: Official SVG artwork rasterized to transparent 512 x 512 RGBA PNG.
Artwork shapes and colors are otherwise unmodified. No font/glyph substitution.
Preparation: node scripts/prepare-emoji-assets.mjs (offline, vendored SVG sources).
Rasterizer used for pinned PNG hashes: sharp 0.35.5, libvips 8.18.7, librsvg 2.63.2.
PNG encoding: compressionLevel=9, adaptiveFiltering=false, palette=false.
Keep this credit and the license available when distributing these graphics.
Twemoji does not endorse this application.

Vendored source files and their original URLs:
${EMOJI_MANIFEST.emojis.map((entry) => `sources/${entry.codepoint}.svg -> ${entry.source}`).join("\n")}
`;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertSafeFilename(filename) {
  assert.equal(typeof filename, "string", "Asset path must be a fixed filename");
  assert.match(filename, /^[a-z0-9][a-z0-9.-]*$/i, "Unsafe asset path: basename required");
}

// Reject symlinks/junctions at every component, not just lexical ../ traversal.
export function readEmojiFile(emojiDir, relativeFile) {
  const segments = relativeFile.split("/");
  for (const segment of segments) assertSafeFilename(segment);
  let filename = path.resolve(emojiDir);
  const root = fs.lstatSync(filename);
  assert.ok(root.isDirectory() && !root.isSymbolicLink(), "Emoji root must be a regular directory");
  for (const [index, segment] of segments.entries()) {
    filename = path.join(filename, segment);
    const stat = fs.lstatSync(filename);
    assert.ok(!stat.isSymbolicLink(), `Symlink asset path rejected: ${relativeFile}`);
    assert.ok(index === segments.length - 1 ? stat.isFile() : stat.isDirectory(), `Not a regular asset path: ${relativeFile}`);
  }
  return fs.readFileSync(filename);
}

export function readPinnedEmojiFile(emojiDir, filename, expectedHash) {
  const bytes = readEmojiFile(emojiDir, filename);
  assert.equal(sha256(bytes), expectedHash, `SHA-256 mismatch: ${filename}`);
  return bytes;
}

function readOptionalEmojiFile(emojiDir, filename) {
  try {
    return readEmojiFile(emojiDir, filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function prepareEmojiAssets(emojiDir = EMOJI_DIR) {
  readPinnedEmojiFile(emojiDir, EMOJI_MANIFEST.licenseFile, LICENSE_SHA256);
  const sources = REACTIONS.map((entry) => readPinnedEmojiFile(emojiDir, `sources/${entry.codepoint}.svg`, entry.sourceSha256));
  const outputs = [];
  let sharp;
  for (const [index, entry] of EMOJI_MANIFEST.emojis.entries()) {
    const current = readOptionalEmojiFile(emojiDir, entry.file);
    if (current && sha256(current) === entry.sha256) continue;
    sharp ??= (await import("sharp")).default;
    const bytes = await sharp(sources[index], { density: 1024 })
      .resize(PNG_SIZE, PNG_SIZE)
      .ensureAlpha()
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, force: true })
      .toBuffer();
    assert.equal(sha256(bytes), entry.sha256, `Rasterizer output differs from pinned PNG: ${entry.file}. Use the rasterizer versions in ATTRIBUTION.txt; do not update hashes automatically.`);
    outputs.push([entry.file, bytes]);
  }
  outputs.push([EMOJI_MANIFEST.attributionFile, Buffer.from(ATTRIBUTION)]);
  outputs.push(["manifest.json", Buffer.from(`${JSON.stringify(EMOJI_MANIFEST, null, 2)}\n`)]);
  let written = 0;
  // Validate all output destinations before writing any files.
  const pending = outputs.filter(([filename, bytes]) => !readOptionalEmojiFile(emojiDir, filename)?.equals(bytes));
  for (const [filename, bytes] of pending) {
    fs.writeFileSync(path.join(emojiDir, filename), bytes);
    written++;
  }
  for (const entry of EMOJI_MANIFEST.emojis) {
    readPinnedEmojiFile(emojiDir, entry.file, entry.sha256);
  }
  assert.deepStrictEqual(JSON.parse(readEmojiFile(emojiDir, "manifest.json").toString("utf8")), EMOJI_MANIFEST);
  assert.equal(readEmojiFile(emojiDir, EMOJI_MANIFEST.attributionFile).toString("utf8"), ATTRIBUTION);
  return { count: EMOJI_MANIFEST.emojis.length, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await prepareEmojiAssets();
    console.log(`[prepare:emoji] ${result.count} PNG verified offline; ${result.written} files written.`);
  } catch (error) {
    console.error(`[prepare:emoji] ${error.message}`);
    process.exitCode = 1;
  }
}

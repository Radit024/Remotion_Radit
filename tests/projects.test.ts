import fs from "node:fs";
import path from "node:path";
import crypto, { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dirs, ensureDataDirs } from "../src/server/env";
import { readAssetManifest, writeAssetManifest, type StoredAsset } from "../src/server/assets";
import {
  createProject,
  readProject,
  saveProject,
  listProjects,
  recoverProjectSource,
  withLock,
  writeNewProject,
} from "../src/server/projects";

import { POST as recoverSource } from "../src/app/api/projects/[id]/recover-source/route";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(randomUUID).mockReset();
});

// IDs persisted in projects cross schema boundaries as plain strings, but the
// crypto mock is typed with the UUID template literal.
const asUuid = (value: string) => value as ReturnType<typeof randomUUID>;

describe("Projects persistence and concurrency", () => {
  const dummyAssetId = "11111111-2222-3333-4444-555555555555";
  const dummyAsset: StoredAsset = {
    id: dummyAssetId,
    kind: "video",
    name: "gameplay.mp4",
    relativePath: `${dummyAssetId}.mp4`,
    filename: `${dummyAssetId}.mp4`,
    mimeType: "video/mp4",
    sizeBytes: 1024 * 1024,
    durationFrames: 3000,
    width: 1920,
    height: 1080,
    hasAudio: true,
    previewReady: true,
    codec: "h264",
    frameRate: 30,
    proxyRelativePath: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    ensureDataDirs();
    const manifest = { ...readAssetManifest(), [dummyAssetId]: dummyAsset };
    writeAssetManifest(manifest);
    fs.writeFileSync(path.join(dirs().assets, dummyAsset.relativePath), "original-video-bytes");
  });

  it("creates and reads a new project with valid defaults", () => {
    const project = createProject(dummyAssetId, "Highlight Mabar");
    expect(project.id).toBeDefined();
    expect(project.revision).toBe(1);
    expect(project.name).toBe("Highlight Mabar");
    expect(project.startFrame).toBe(0);
    expect(project.endFrame).toBe(3000);

    const loaded = readProject(project.id);
    expect(loaded.id).toBe(project.id);
    expect(loaded.revision).toBe(1);
    expect(loaded.name).toBe("Highlight Mabar");
  });

  it("saves draft with incremented revision when revision matches", async () => {
    const project = createProject(dummyAssetId, "Match 1");
    const draft = {
      ...project,
      startFrame: 300,
      endFrame: 1200,
      momentFrame: 600,
    };

    const saved = await saveProject(project.id, draft, 1);
    expect(saved.revision).toBe(2);
    expect(saved.startFrame).toBe(300);

    const reloaded = readProject(project.id);
    expect(reloaded.revision).toBe(2);
    expect(reloaded.startFrame).toBe(300);
  });

  it("rejects concurrent save with stale revision (409 conflict)", async () => {
    const project = createProject(dummyAssetId, "Match Concurrency");
    const draftA = { ...project, startFrame: 100 };
    const draftB = { ...project, startFrame: 200 };

    // Client A saves successfully
    const savedA = await saveProject(project.id, draftA, 1);
    expect(savedA.revision).toBe(2);

    // Client B attempts to save with stale expected revision 1
    await expect(saveProject(project.id, draftB, 1)).rejects.toThrowError(
      /sudah tersimpan pada revisi 2/,
    );
  });

  it("lists summaries of created projects", () => {
    const p1 = createProject(dummyAssetId, "Alpha");
    const p2 = createProject(dummyAssetId, "Beta");

    const list = listProjects();
    expect(list.some((p) => p.id === p1.id)).toBe(true);
    expect(list.some((p) => p.id === p2.id)).toBe(true);
  });

  function publishAsset(kind: StoredAsset["kind"] = "video", durationFrames = 3000): StoredAsset {
    const id = randomUUID();
    const extension = kind === "video" ? "mp4" : kind === "image" ? "png" : "wav";
    const asset: StoredAsset = { ...dummyAsset, id, kind, durationFrames, name: `replacement.${extension}`, relativePath: `${id}.${extension}`, filename: `${id}.${extension}` };
    writeAssetManifest({ ...readAssetManifest(), [id]: asset });
    fs.writeFileSync(path.join(dirs().assets, asset.relativePath), `bytes-${id}`);
    return asset;
  }

  function diskProject(id: string): string {
    return path.join(dirs().projects, `${id}.json`);
  }

  it("derives all source states at read time without persisting readiness or exposing storage", async () => {
    const project = createProject(dummyAssetId, "Readiness");
    const summary = () => listProjects().find((item) => item.id === project.id)!;
    expect(project.sourceStatus).toBe("available");
    expect(readProject(project.id).sourceStatus).toBe("available");
    expect(summary().sourceStatus).toBe("available");
    expect(JSON.parse(fs.readFileSync(diskProject(project.id), "utf8"))).not.toHaveProperty("sourceStatus");
    const before = fs.readFileSync(diskProject(project.id));
    fs.rmSync(path.join(dirs().assets, dummyAsset.relativePath));
    expect(readProject(project.id).sourceStatus).toBe("file-missing");
    expect(summary()).toMatchObject({ sourceStatus: "file-missing", sourceName: "gameplay.mp4" });
    const manifest = readAssetManifest();
    delete manifest[dummyAssetId];
    writeAssetManifest(manifest);
    expect(readProject(project.id).sourceStatus).toBe("metadata-missing");
    expect(summary()).toMatchObject({ sourceStatus: "metadata-missing", sourceName: "sumber hilang" });
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
    expect(JSON.stringify(readProject(project.id))).not.toContain(dirs().assets);
    writeAssetManifest({ ...manifest, [dummyAssetId]: dummyAsset });
    fs.writeFileSync(path.join(dirs().assets, dummyAsset.relativePath), "restored-video");
    const saved = await saveProject(project.id, readProject(project.id), 1);
    expect(saved.sourceStatus).toBe("available");
    expect(JSON.parse(fs.readFileSync(diskProject(project.id), "utf8"))).not.toHaveProperty("sourceStatus");
  });

  it("ignores old persisted readiness and private extra fields in public project reads", () => {
    const project = createProject(dummyAssetId, "Old metadata");
    const raw = JSON.parse(fs.readFileSync(diskProject(project.id), "utf8"));
    fs.writeFileSync(diskProject(project.id), JSON.stringify({ ...raw, sourceStatus: "metadata-missing", relativePath: "private/path" }));
    const loaded = readProject(project.id);
    expect(loaded.sourceStatus).toBe("available");
    expect(loaded).not.toHaveProperty("relativePath");
  });

  it("makes a revision-1 copy preserving settings/timing/captions/effects and every original byte", async () => {
    const project = createProject(dummyAssetId, "A".repeat(120));
    const image = publishAsset("image", 0);
    const audio = publishAsset("audio", 500);
    const replacement = publishAsset("video", 3600);
    const saved = await saveProject(project.id, {
      ...project, startFrame: 300, endFrame: 1200, momentFrame: 600,
      preset: "meme", layout: "crop", focusX: 0.2, focusY: 0.8, captionY: 0.6, freezeFrames: 20, replayFrames: 30,
      captions: [{ id: "caption-1", startFrame: 330, endFrame: 450, text: "Subtitle tetap", speaker: "Pemain" }],
      effects: [
        { id: "image-1", kind: "image", startFrame: 600, endFrame: 645, assetId: image.id, text: "", strength: 1 },
        { id: "audio-1", kind: "sfx", startFrame: 600, endFrame: 700, assetId: audio.id, text: "", strength: 1 },
        { id: "zoom-1", kind: "zoom", startFrame: 580, endFrame: 700, assetId: null, text: "", strength: 1.3 },
      ],
    }, 1);
    const output = path.join(dirs().outputs, `${randomUUID()}.mp4`);
    fs.writeFileSync(output, "existing-render-output");
    const originalProjectBytes = fs.readFileSync(diskProject(project.id));
    const sourceBytes = fs.readFileSync(path.join(dirs().assets, dummyAsset.relativePath));
    const replacementBytes = fs.readFileSync(path.join(dirs().assets, replacement.relativePath));
    const manifestBytes = fs.readFileSync(path.join(dirs().assets, "assets.json"));
    const copy = await recoverProjectSource(project.id, replacement.id, saved.revision);
    expect(copy.id).not.toBe(project.id);
    expect(copy.revision).toBe(1);
    expect(copy.assetId).toBe(replacement.id);
    expect(copy.sourceStatus).toBe("available");
    expect(copy.name.length).toBeLessThanOrEqual(120);
    expect(copy.name.endsWith(" (salinan)")).toBe(true);
    for (const key of ["startFrame", "endFrame", "momentFrame", "preset", "layout", "focusX", "focusY", "captionY", "freezeFrames", "replayFrames", "captions", "effects"] as const) {
      expect(copy[key]).toEqual(saved[key]);
    }
    expect(fs.readFileSync(diskProject(project.id))).toEqual(originalProjectBytes);
    expect(fs.readFileSync(path.join(dirs().assets, dummyAsset.relativePath))).toEqual(sourceBytes);
    expect(fs.readFileSync(path.join(dirs().assets, replacement.relativePath))).toEqual(replacementBytes);
    expect(fs.readFileSync(path.join(dirs().assets, "assets.json"))).toEqual(manifestBytes);
    expect(fs.readFileSync(output, "utf8")).toBe("existing-render-output");
    expect(JSON.parse(fs.readFileSync(diskProject(copy.id), "utf8"))).not.toHaveProperty("sourceStatus");
  });

  it("writeNewProject never overwrites an existing project", () => {
    const project = createProject(dummyAssetId, "Existing project");
    const before = fs.readFileSync(diskProject(project.id));
    const filesBefore = fs.readdirSync(dirs().projects).sort();
    expect(() => writeNewProject({ ...project, name: "Must not replace" })).toThrow();
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
    expect(fs.readdirSync(dirs().projects).sort()).toEqual(filesBefore);
  });

  it("retries collisions with both the original and another existing project without changing their bytes", async () => {
    const project = createProject(dummyAssetId, "Recovery original");
    const occupied = createProject(dummyAssetId, "Existing unrelated project");
    const replacement = publishAsset();
    const freshId = crypto.randomUUID();
    const originalBytes = fs.readFileSync(diskProject(project.id));
    const occupiedBytes = fs.readFileSync(diskProject(occupied.id));
    const countBefore = listProjects().length;
    vi.mocked(randomUUID).mockClear().mockReturnValueOnce(asUuid(project.id)).mockReturnValueOnce(asUuid(occupied.id)).mockReturnValueOnce(freshId);
    const copy = await recoverProjectSource(project.id, replacement.id, 1);
    expect(copy).toMatchObject({ id: freshId, revision: 1, assetId: replacement.id, name: "Recovery original (salinan)" });
    expect(randomUUID).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(originalBytes);
    expect(fs.readFileSync(diskProject(occupied.id))).toEqual(occupiedBytes);
    expect(readProject(freshId)).toEqual(copy);
    expect(listProjects().length).toBe(countBefore + 1);
    expect(fs.readdirSync(dirs().projects).filter((file) => file.startsWith(".publish-") || file.endsWith(".tmp"))).toEqual([]);
  });

  it("stops after five colliding UUIDs without changing any existing bytes or leaving staging files", async () => {
    const project = createProject(dummyAssetId, "Bounded recovery");
    const replacement = publishAsset();
    const before = fs.readFileSync(diskProject(project.id));
    const filesBefore = fs.readdirSync(dirs().projects).sort();
    vi.mocked(randomUUID).mockClear().mockReturnValue(asUuid(project.id));
    await expect(recoverProjectSource(project.id, replacement.id, 1)).rejects.toMatchObject({ code: "DISK_WRITE_FAILED", status: 500 });
    expect(randomUUID).toHaveBeenCalledTimes(5);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
    expect(fs.readdirSync(dirs().projects).sort()).toEqual(filesBefore);
  });

  it("permits a fresh UUID on the fifth and final publication attempt", async () => {
    const project = createProject(dummyAssetId, "Last attempt");
    const replacement = publishAsset();
    const freshId = crypto.randomUUID();
    const before = fs.readFileSync(diskProject(project.id));
    vi.mocked(randomUUID).mockClear()
      .mockReturnValueOnce(asUuid(project.id)).mockReturnValueOnce(asUuid(project.id))
      .mockReturnValueOnce(asUuid(project.id)).mockReturnValueOnce(asUuid(project.id)).mockReturnValueOnce(freshId);
    expect((await recoverProjectSource(project.id, replacement.id, 1)).id).toBe(freshId);
    expect(randomUUID).toHaveBeenCalledTimes(5);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
  });

  it("preserves a competing project published at the exact exclusive-publication boundary", async () => {
    const project = createProject(dummyAssetId, "Publication race");
    const replacement = publishAsset();
    const collisionId = crypto.randomUUID();
    const freshId = crypto.randomUUID();
    const originalBytes = fs.readFileSync(diskProject(project.id));
    const competingBytes = Buffer.from(JSON.stringify({ ...JSON.parse(originalBytes.toString()), id: collisionId, name: "Competing project" }));
    const linkSync = fs.linkSync;
    vi.spyOn(fs, "linkSync").mockImplementationOnce((staged, destination) => {
      expect(destination).toBe(diskProject(collisionId));
      expect(JSON.parse(fs.readFileSync(staged, "utf8")).id).toBe(collisionId);
      fs.writeFileSync(destination, competingBytes, { flag: "wx" });
      linkSync(staged, destination);
    });
    vi.mocked(randomUUID).mockClear().mockReturnValueOnce(collisionId).mockReturnValueOnce(freshId);
    const copy = await recoverProjectSource(project.id, replacement.id, 1);
    expect(copy.id).toBe(freshId);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(diskProject(collisionId))).toEqual(competingBytes);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(originalBytes);
    expect(readProject(collisionId).name).toBe("Competing project");
  });

  it("does not retry non-collision publication failures and cleans up the staged JSON", async () => {
    const project = createProject(dummyAssetId, "Storage failure");
    const replacement = publishAsset();
    const before = fs.readFileSync(diskProject(project.id));
    const filesBefore = fs.readdirSync(dirs().projects).sort();
    vi.spyOn(fs, "linkSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("Disk failure"), { code: "EIO" });
    });
    vi.mocked(randomUUID).mockClear();
    await expect(recoverProjectSource(project.id, replacement.id, 1)).rejects.toMatchObject({ code: "DISK_WRITE_FAILED" });
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
    expect(fs.readdirSync(dirs().projects).sort()).toEqual(filesBefore);
  });

  it("ordinary saves still atomically replace the existing revision", async () => {
    const project = createProject(dummyAssetId, "Normal save");
    const rename = vi.spyOn(fs, "renameSync");
    const link = vi.spyOn(fs, "linkSync");
    const saved = await saveProject(project.id, { ...project, name: "Updated normally" }, 1);
    expect(saved.revision).toBe(2);
    expect(readProject(project.id).name).toBe("Updated normally");
    expect(rename).toHaveBeenCalledWith(expect.any(String), diskProject(project.id));
    expect(link).not.toHaveBeenCalled();
  });

  it.each(["metadata-missing", "file-missing"])("recovers a %s source without needing the old source", async (status) => {
    const project = createProject(dummyAssetId, "Missing source");
    const replacement = publishAsset();
    if (status === "file-missing") fs.rmSync(path.join(dirs().assets, dummyAsset.relativePath));
    else {
      const manifest = readAssetManifest();
      delete manifest[dummyAssetId];
      writeAssetManifest(manifest);
    }
    expect(readProject(project.id).sourceStatus).toBe(status);
    expect((await recoverProjectSource(project.id, replacement.id, 1)).sourceStatus).toBe("available");
    expect(readProject(project.id).sourceStatus).toBe(status);
  });

  it("rejects a shorter source without clamping or publishing a copy", async () => {
    const project = createProject(dummyAssetId, "Short replacement");
    const replacement = publishAsset("video", 1500);
    const before = fs.readFileSync(diskProject(project.id));
    const count = listProjects().length;
    await expect(recoverProjectSource(project.id, replacement.id, 1)).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    expect(listProjects().length).toBe(count);
    expect(fs.readFileSync(diskProject(project.id))).toEqual(before);
  });

  it("rejects nonvideo, missing metadata, missing files, and directory sources", async () => {
    const project = createProject(dummyAssetId, "Invalid replacement");
    const image = publishAsset("image");
    const replacement = publishAsset();
    await expect(recoverProjectSource(project.id, image.id, 1)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recoverProjectSource(project.id, randomUUID(), 1)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    fs.rmSync(path.join(dirs().assets, replacement.relativePath));
    await expect(recoverProjectSource(project.id, replacement.id, 1)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    fs.mkdirSync(path.join(dirs().assets, replacement.relativePath));
    await expect(recoverProjectSource(project.id, replacement.id, 1)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });

  it.each(["image", "audio"] as const)("rejects missing related %s files or metadata instead of dropping effects", async (kind) => {
    const project = createProject(dummyAssetId, "Related assets");
    const image = publishAsset(kind, kind === "image" ? 0 : 300);
    const replacement = publishAsset();
    const saved = await saveProject(project.id, { ...project, effects: [{ id: "related", kind: kind === "image" ? "image" : "sfx", startFrame: 0, endFrame: 45, assetId: image.id, text: "", strength: 1 }] }, 1);
    fs.rmSync(path.join(dirs().assets, image.relativePath));
    await expect(recoverProjectSource(project.id, replacement.id, saved.revision)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    const manifest = readAssetManifest();
    delete manifest[image.id];
    writeAssetManifest(manifest);
    await expect(recoverProjectSource(project.id, replacement.id, saved.revision)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(readProject(project.id).effects).toEqual(saved.effects);
  });

  it.each(["caption", "effect"])("rejects %s timing beyond a replacement, even when selection fits", async (kind) => {
    const project = createProject(dummyAssetId, "Outside source");
    const saved = await saveProject(project.id, {
      ...project, endFrame: 1000, momentFrame: 500,
      captions: kind === "caption" ? [{ id: "caption", startFrame: 1800, endFrame: 1900, text: "Must survive", speaker: null }] : [],
      effects: kind === "effect" ? [{ id: "effect", kind: "reaction", startFrame: 1800, endFrame: 1900, assetId: null, text: "Must survive", strength: 1 }] : [],
    }, 1);
    const replacement = publishAsset("video", 1500);
    await expect(recoverProjectSource(project.id, replacement.id, saved.revision)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects corrupt video metadata and mismatched related asset kinds", async () => {
    const project = createProject(dummyAssetId, "Invalid metadata");
    const image = publishAsset("image", 0);
    const saved = await saveProject(project.id, { ...project, effects: [{ id: "image", kind: "image", startFrame: 0, endFrame: 45, assetId: image.id, text: "", strength: 1 }] }, 1);
    const replacement = publishAsset();
    writeAssetManifest({ ...readAssetManifest(), [replacement.id]: { ...replacement, durationFrames: -1 } });
    await expect(recoverProjectSource(project.id, replacement.id, saved.revision)).rejects.toMatchObject({ code: "VALIDATION" });
    writeAssetManifest({ ...readAssetManifest(), [replacement.id]: replacement, [image.id]: { ...image, kind: "audio" } });
    await expect(recoverProjectSource(project.id, replacement.id, saved.revision)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects stale revisions under the same project lock as save", async () => {
    const project = createProject(dummyAssetId, "Lock race");
    const replacement = publishAsset();
    const count = listProjects().length;
    const result = await withLock(`project-${project.id}`, async () => {
      const saving = saveProject(project.id, { ...project, name: "Saved first" }, 1);
      const recovering = recoverProjectSource(project.id, replacement.id, 1);
      return { saving, recovering };
    });
    await expect(result.saving).resolves.toMatchObject({ revision: 2 });
    await expect(result.recovering).rejects.toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
    expect(listProjects().length).toBe(count);
    expect(readProject(project.id).name).toBe("Saved first");
  });

  it("serves a 201 copy through the guarded route with async params", async () => {
    const project = createProject(dummyAssetId, "Route recovery");
    const replacement = publishAsset();
    const response = await recoverSource(new Request(`http://127.0.0.1:3000/api/projects/${project.id}/recover-source`, {
      method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ assetId: replacement.id, revision: 1 }),
    }), { params: Promise.resolve({ id: project.id }) });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBe('"1"');
    const { project: copy } = await response.json();
    expect(copy).toMatchObject({ assetId: replacement.id, revision: 1, sourceStatus: "available", name: "Route recovery (salinan)" });
    expect(copy.id).not.toBe(project.id);
  });

  it("rejects reading nonexistent project", () => {
    expect(() => readProject("00000000-0000-0000-0000-000000000000")).toThrowError(
      /tidak ditemukan/,
    );
  });
});

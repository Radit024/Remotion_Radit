import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dirs, ensureDataDirs } from "../src/server/env";
import { readAssetManifest, writeAssetManifest, type StoredAsset } from "../src/server/assets";
import {
  createProject,
  readProject,
  saveProject,
  listProjects,
} from "../src/server/projects";
import { ApiError } from "../src/server/guard";

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

  it("rejects reading nonexistent project", () => {
    expect(() => readProject("00000000-0000-0000-0000-000000000000")).toThrowError(
      /tidak ditemukan/,
    );
  });
});

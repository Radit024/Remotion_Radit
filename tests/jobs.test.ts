import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { dirs, ensureDataDirs } from "../src/server/env";
import { readAssetManifest, writeAssetManifest, type StoredAsset } from "../src/server/assets";
import { createProject } from "../src/server/projects";
import {
  createJob,
  readJob,
  requestCancel,
  isCancelRequested,
  publicJob,
} from "../src/server/jobs";

describe("Job lifecycle and queue management", () => {
  const dummyAssetId = "22222222-3333-4444-5555-666666666666";
  const dummyAsset: StoredAsset = {
    id: dummyAssetId,
    kind: "video",
    name: "clip.mp4",
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
    writeAssetManifest({ ...readAssetManifest(), [dummyAssetId]: dummyAsset });
    const jobDir = dirs().jobs;
    if (fs.existsSync(jobDir)) {
      for (const file of fs.readdirSync(jobDir)) {
        if (file.endsWith(".json")) {
          try {
            fs.rmSync(path.join(jobDir, file));
          } catch {
            /* ignore */
          }
        }
      }
    }
  });

  it("creates a queued render job with frozen snapshot", () => {
    const project = createProject(dummyAssetId, "Render Test");
    const job = createJob({
      kind: "render",
      projectId: project.id,
      expectedRevision: 1,
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.kind).toBe("render");
    expect(job.snapshot).toBeDefined();
    expect(job.snapshot?.name).toBe("Render Test");

    const read = readJob(job.id);
    expect(read).not.toBeNull();
    expect(read?.status).toBe("queued");
  });

  it("reuses existing active render job for same project and revision", () => {
    const project = createProject(dummyAssetId, "Duplicate Render");
    const job1 = createJob({
      kind: "render",
      projectId: project.id,
      expectedRevision: 1,
    });

    const job2 = createJob({
      kind: "render",
      projectId: project.id,
      expectedRevision: 1,
    });

    expect(job2.id).toBe(job1.id);
  });

  it("rejects job creation with stale revision", () => {
    const project = createProject(dummyAssetId, "Stale Revision");
    expect(() =>
      createJob({
        kind: "render",
        projectId: project.id,
        expectedRevision: 99,
      }),
    ).toThrowError(/revisi/);
  });

  it("requests cancel and sets marker file", async () => {
    const project = createProject(dummyAssetId, "Cancel Job");
    const job = createJob({
      kind: "render",
      projectId: project.id,
      expectedRevision: 1,
    });

    expect(isCancelRequested(job.id)).toBe(false);
    const updated = await requestCancel(job.id);
    expect(updated.cancelRequested).toBe(true);
    expect(isCancelRequested(job.id)).toBe(true);
  });

  it("returns public representation without internal paths", () => {
    const project = createProject(dummyAssetId, "Public Job");
    const job = createJob({
      kind: "render",
      projectId: project.id,
      expectedRevision: 1,
    });

    const pub = publicJob(job);
    expect(pub.id).toBe(job.id);
    expect((pub as unknown as { snapshot?: unknown }).snapshot).toBeUndefined();
  });
});

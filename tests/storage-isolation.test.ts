import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import { dirs, ensureDataDirs } from "../src/server/env";

// This deliberately writes during module evaluation, before any test hooks.
const importTimeDataDir = dirs().root;
ensureDataDirs();
const importTimeFixture = path.join(dirs().tmp, "import-time-fixture.txt");
fs.writeFileSync(importTimeFixture, "isolated fixture");

function compileFile(relativePath: string): string {
  return transpileModule(fs.readFileSync(path.resolve(relativePath), "utf8"), {
    fileName: relativePath.replace(/\.mjs$/, ".ts"),
    compilerOptions: { module: ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
}

const setupCode = compileFile("tests/setup.ts");
const scriptCode = {
  "create-fixture": compileFile("scripts/create-fixture.mjs"),
  "smoke-render": compileFile("scripts/smoke-render.mjs"),
};

function moduleLoader(modules: Record<string, unknown>) {
  return (name: string) => {
    if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected module: ${name}`);
    return modules[name];
  };
}

type MockEnv = Record<string, string | undefined>;

const setupCleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of setupCleanups.splice(0)) cleanup();
});

function setupHarness(previousDataDir?: string, overrides: Partial<typeof fs> = {}) {
  const env: MockEnv = previousDataDir === undefined ? {} : { DATA_DIR: previousDataDir };
  const cwd = path.join(importTimeDataDir, `setup-harness-${randomUUID()}`);
  const hooks: Array<() => void> = [];
  const rmSync = vi.fn(fs.rmSync);
  const info = vi.fn();
  runInNewContext(setupCode, {
    exports: {},
    require: moduleLoader({
      "@testing-library/jest-dom/vitest": {},
      "node:assert/strict": assert,
      "node:fs": { ...fs, rmSync, ...overrides },
      "node:os": os,
      "node:path": path,
      vitest: { afterAll: (hook: () => void) => hooks.push(hook) },
    }),
    process: { env, cwd: () => cwd },
    console: { info },
  });
  const ownedDir = env.DATA_DIR;
  if (!ownedDir || hooks.length !== 1) throw new Error("Setup did not establish isolated storage and teardown");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    hooks[0]();
  };
  setupCleanups.push(cleanup);
  return { env, cwd, ownedDir, cleanup, rmSync, info };
}

function scriptHarness(script: keyof typeof scriptCode, env: MockEnv) {
  const mkdirSync = vi.fn();
  const warn = vi.fn();
  const renderMedia = vi.fn<(options: { outputLocation: string }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const spawnSync = vi.fn<(tool: string, args: string[], options?: { env?: MockEnv }) => { status: number; stdout: string }>()
    .mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        streams: [{ codec_name: "h264", width: 1080, height: 1920 }],
        format: { duration: "30.0" },
      }),
    });
  const fileServer = {
    listen: (_port: number, _host: string, ready: () => void) => ready(),
    address: () => ({ port: 12345 }),
    close: vi.fn(),
  };
  // Execute the real script with mocked I/O, so no media tools or user writes occur.
  const run = () => runInNewContext(`(async () => { ${scriptCode[script]} })()`, {
    exports: {},
    require: moduleLoader({
      "@remotion/bundler": { bundle: async () => "bundle-url" },
      "@remotion/renderer": {
        renderMedia,
        selectComposition: async () => ({ durationInFrames: 900 }),
      },
      "node:child_process": { spawnSync },
      "node:fs": { mkdirSync, existsSync: () => false, statSync: () => ({ size: 1024 }) },
      "node:path": path,
      "node:http": { createServer: () => fileServer },
    }),
    process: {
      env: { ...env },
      cwd: () => process.cwd(),
      exit: (code: number) => { throw new Error(`Unexpected exit: ${code}`); },
    },
    console: { log: vi.fn(), error: vi.fn(), warn },
  }) as Promise<void>;
  return { run, mkdirSync, spawnSync, renderMedia, warn };
}

describe("Test storage isolation", () => {
  it("isolates fixtures before test module evaluation", () => {
    expect(importTimeDataDir).toBe(process.env.DATA_DIR);
    expect(path.resolve(importTimeDataDir)).not.toBe(path.resolve(process.cwd(), ".data"));
    expect(path.dirname(path.resolve(importTimeDataDir))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(importTimeDataDir)).toMatch(/^takefield-tests-/);
    expect(fs.readFileSync(importTimeFixture, "utf8")).toBe("isolated fixture");
  });

  it.each([undefined, "", "previous-data-root"])("restores previous DATA_DIR (%s) and only cleans its owned directory", (previous) => {
    const harness = setupHarness(previous);
    const sentinel = path.join(harness.cwd, ".data", "keep.txt");
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });
    fs.writeFileSync(sentinel, "keep");
    expect(path.dirname(path.resolve(harness.ownedDir))).toBe(path.resolve(os.tmpdir()));
    harness.env.DATA_DIR = path.dirname(sentinel);
    harness.cleanup();
    expect(fs.existsSync(harness.ownedDir)).toBe(false);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
    expect(harness.rmSync).toHaveBeenCalledExactlyOnceWith(path.resolve(harness.ownedDir), { recursive: true, force: true });
    expect(harness.env.DATA_DIR).toBe(previous);
    expect(Object.hasOwn(harness.env, "DATA_DIR")).toBe(previous !== undefined);
    expect(harness.info).toHaveBeenCalledWith("[tests:storage] .data/projects before=0 after=0");
  });

  it("fails on changed user project counts but still cleans up and restores DATA_DIR", () => {
    const harness = setupHarness("original-root");
    // Simulated user data lives inside this test's owned temp root, not real .data.
    const projects = path.join(harness.cwd, ".data", "projects");
    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(path.join(projects, "unexpected.json"), "{}");
    expect(harness.cleanup).toThrowError(/user project count/);
    expect(harness.info).toHaveBeenCalledWith("[tests:storage] .data/projects before=0 after=1");
    expect(fs.existsSync(harness.ownedDir)).toBe(false);
    expect(harness.env.DATA_DIR).toBe("original-root");
    expect(fs.existsSync(path.join(projects, "unexpected.json"))).toBe(true);
  });

  it("refuses cleanup when the resolved parent is not the OS temp directory", () => {
    const unownedDir = path.join(importTimeDataDir, "takefield-tests-unowned");
    fs.mkdirSync(unownedDir);
    const sentinel = path.join(unownedDir, "keep.txt");
    fs.writeFileSync(sentinel, "keep");
    const harness = setupHarness("original-root", { mkdtempSync: vi.fn().mockReturnValue(unownedDir) });
    expect(harness.cleanup).toThrowError(/Refusing cleanup outside the OS temp directory/);
    expect(harness.rmSync).not.toHaveBeenCalled();
    expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
    expect(harness.env.DATA_DIR).toBe("original-root");
  });

  it("restores DATA_DIR even when removal fails", () => {
    const failedRemoval = vi.fn(() => { throw new Error("removal failed"); });
    const harness = setupHarness("original-root", { rmSync: failedRemoval });
    expect(harness.cleanup).toThrowError("removal failed");
    expect(harness.env.DATA_DIR).toBe("original-root");
    // The deliberately failing mock left an owned mkdtemp result to remove.
    assert.equal(path.dirname(path.resolve(harness.ownedDir)), path.resolve(os.tmpdir()));
    fs.rmSync(harness.ownedDir, { recursive: true, force: true });
  });
});

for (const script of ["create-fixture", "smoke-render"] as const) {
  describe(`${script} storage isolation`, () => {
    it.each([path.join(os.tmpdir(), "takefield-script-check"), "relative-test-storage", "  relative-test-storage  "])("respects DATA_DIR=%s", async (configured) => {
      const harness = scriptHarness(script, { DATA_DIR: configured, CI: "true" });
      await harness.run();
      const root = path.resolve(process.cwd(), configured.trim());
      const tmp = path.join(root, "tmp");
      expect(harness.mkdirSync).toHaveBeenCalledExactlyOnceWith(tmp, { recursive: true });
      expect(harness.warn).not.toHaveBeenCalled();
      if (script === "create-fixture") {
        expect(harness.spawnSync).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining([path.join(tmp, "fixture-300s.mp4")]), expect.any(Object));
      } else {
        expect(harness.renderMedia.mock.calls.map(([options]) => options.outputLocation)).toEqual([
          path.join(tmp, "smoke-light.mp4"),
          path.join(tmp, "smoke-meme.mp4"),
        ]);
        expect(harness.spawnSync).toHaveBeenCalledWith("node", ["scripts/create-fixture.mjs"], expect.objectContaining({
          env: expect.objectContaining({ DATA_DIR: root }),
        }));
      }
    });

    it.each([{ CI: "true" }, { VITEST: "true" }, { NODE_ENV: "test" }, { CI: "true", DATA_DIR: "   " }])("rejects automated fallback before any writes (%j)", async (env) => {
      const harness = scriptHarness(script, env);
      await expect(harness.run()).rejects.toThrowError(/DATA_DIR.*manual only/);
      expect(harness.mkdirSync).not.toHaveBeenCalled();
      expect(harness.spawnSync).not.toHaveBeenCalled();
      expect(harness.renderMedia).not.toHaveBeenCalled();
    });

    it("retains a warned .data fallback for intentional manual use", async () => {
      const harness = scriptHarness(script, {});
      await harness.run();
      expect(harness.mkdirSync).toHaveBeenCalledExactlyOnceWith(path.join(process.cwd(), ".data", "tmp"), { recursive: true });
      expect(harness.warn).toHaveBeenCalledWith(expect.stringContaining("Manual .data fallback:"));
    });
  });
}

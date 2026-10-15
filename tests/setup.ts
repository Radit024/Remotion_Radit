import "@testing-library/jest-dom/vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const previousDataDir = process.env.DATA_DIR;
const userDataDir = path.resolve(process.cwd(), ".data");
const userProjectsDir = path.join(userDataDir, "projects");

function countUserProjects(): number {
  try {
    return fs.readdirSync(userProjectsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

const userProjectsBefore = countUserProjects();
// Setup files run before test imports, including import-time storage fixtures.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "takefield-tests-"));
assert.notEqual(path.resolve(testDataDir), userDataDir, "Test storage must not be user .data");
process.env.DATA_DIR = testDataDir;

afterAll(() => {
  try {
    const userProjectsAfter = countUserProjects();
    console.info(`[tests:storage] .data/projects before=${userProjectsBefore} after=${userProjectsAfter}`);
    assert.equal(userProjectsAfter, userProjectsBefore, "Tests must not change the user project count");
  } finally {
    try {
      // Delete the owned mkdtemp result, never a potentially reassigned DATA_DIR.
      const ownedDir = path.resolve(testDataDir);
      assert.equal(path.dirname(ownedDir), path.resolve(os.tmpdir()), "Refusing cleanup outside the OS temp directory");
      assert.notEqual(ownedDir, userDataDir, "Refusing cleanup of user .data");
      fs.rmSync(ownedDir, { recursive: true, force: true });
    } finally {
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
    }
  }
});

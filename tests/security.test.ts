import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { POST as recoverSource } from "../src/app/api/projects/[id]/recover-source/route";
import { recoverProjectSource } from "../src/server/projects";
import { assetContentPath, type StoredAsset } from "../src/server/assets";
import { dirs, ensureDataDirs } from "../src/server/env";
import {
  checkHost,
  checkOrigin,
  checkFetchMetadata,
  assertUuid,
  parseRange,
  ApiError,
} from "../src/server/guard";

describe("Security and Guard", () => {
  describe("checkHost", () => {
    it("accepts loopback 127.0.0.1:3000", () => {
      const req = new Request("http://127.0.0.1:3000/api/projects", {
        headers: { host: "127.0.0.1:3000" },
      });
      expect(() => checkHost(req)).not.toThrow();
    });

    it("rejects non-loopback host", () => {
      const req = new Request("http://evil.com/api/projects", {
        headers: { host: "evil.com" },
      });
      expect(() => checkHost(req)).toThrowError(/tidak diizinkan/);
    });

    it("rejects missing host header", () => {
      const req = new Request("http://127.0.0.1:3000/api/projects");
      expect(() => checkHost(req)).toThrow();
    });
  });

  describe("checkOrigin", () => {
    it("allows same origin localhost", () => {
      const req = new Request("http://127.0.0.1:3000/api/projects", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        },
      });
      expect(() => checkOrigin(req)).not.toThrow();
    });

    it("rejects cross-site origin", () => {
      const req = new Request("http://127.0.0.1:3000/api/projects", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "https://attacker.example",
        },
      });
      expect(() => checkOrigin(req)).toThrowError(/Origin tidak berasal/);
    });
  });

  describe("checkFetchMetadata", () => {
    it("allows same-origin or none sec-fetch-site", () => {
      const req1 = new Request("http://127.0.0.1:3000/api/projects", {
        headers: { "sec-fetch-site": "same-origin" },
      });
      expect(() => checkFetchMetadata(req1)).not.toThrow();

      const req2 = new Request("http://127.0.0.1:3000/api/projects", {
        headers: { "sec-fetch-site": "none" },
      });
      expect(() => checkFetchMetadata(req2)).not.toThrow();
    });

    it("rejects cross-site fetch metadata", () => {
      const req = new Request("http://127.0.0.1:3000/api/projects", {
        headers: { "sec-fetch-site": "cross-site" },
      });
      expect(() => checkFetchMetadata(req)).toThrowError(/lintas situs ditolak/);
    });
  });

  describe("assertUuid", () => {
    it("accepts standard valid UUID", () => {
      const valid = "123e4567-e89b-12d3-a456-426614174000";
      expect(assertUuid(valid)).toBe(valid);
    });

    it("rejects path traversal attempts", () => {
      expect(() => assertUuid("../etc/passwd")).toThrow();
      expect(() => assertUuid("..\\windows\\system32")).toThrow();
      expect(() => assertUuid("123e4567-e89b-12d3-a456-426614174000/sub")).toThrow();
    });

    it("rejects malformed string", () => {
      expect(() => assertUuid("not-a-uuid")).toThrow();
      expect(() => assertUuid("")).toThrow();
    });
  });

  describe("recover-source route security", () => {
    const id = randomUUID();
    const assetId = randomUUID();
    const headers = { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" };
    async function recover(body: unknown, extraHeaders: Record<string, string> = {}, projectId: string = id) {
      return recoverSource(new Request("http://127.0.0.1:3000/api/projects/recover-source", {
        method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: projectId }) });
    }

    it.each([
      { origin: "https://attacker.example" },
      { host: "attacker.example" },
      { "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])("rejects unsafe request headers before any mutation: %j", async (extraHeaders) => {
      const response = await recover({ assetId, revision: 1 }, extraHeaders);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION");
    });

    it.each(["../outside", "..\\outside", `${id}/child`, "------------------------------------"])("rejects invalid project path %s", async (projectId) => {
      const response = await recover({ assetId, revision: 1 }, {}, projectId);
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("UUID");
    });

    it.each([
      {}, { assetId }, { assetId, revision: 0 }, { assetId, revision: -1 },
      { assetId, revision: 1.5 }, { assetId, revision: "1" }, { assetId, revision: Number.MAX_SAFE_INTEGER + 1 },
      { assetId: "../private.mp4", revision: 1 }, { assetId: "..\\private.mp4", revision: 1 },
      { assetId: "not-a-uuid", revision: 1 }, { assetId, revision: 1, path: "private.mp4" },
      { assetId, revision: 1, name: "Overwrite" }, { assetId, revision: 1, effects: [] },
      null, [assetId, 1],
    ])("strictly rejects unsafe or malformed recovery body %j", async (body) => {
      const response = await recover(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION");
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("returns a validation error for malformed JSON without echoing request data", async () => {
      const response = await recoverSource(new Request("http://127.0.0.1:3000/api/projects/recover-source", {
        method: "POST", headers, body: "private:not-json",
      }), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain("private:not-json");
    });

    it("also validates IDs and positive revisions at the service boundary", async () => {
      await expect(recoverProjectSource("../project", assetId, 1)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(recoverProjectSource(id, "../asset", 1)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(recoverProjectSource(id, assetId, 0)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(recoverProjectSource(id, assetId, 1.5)).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("does not treat paths outside managed assets as available or leak filesystem details", () => {
      ensureDataDirs();
      const outside = path.join(dirs().tmp, "private-video.mp4");
      fs.writeFileSync(outside, "outside-content");
      const asset = { id: assetId, relativePath: "../tmp/private-video.mp4" } as StoredAsset;
      try {
        assetContentPath(asset);
        expect.fail("Unmanaged asset must not be readable");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).not.toContain(outside);
        expect((error as ApiError).message).not.toContain("private-video");
      }
    });
  });

  describe("parseRange", () => {
    it("returns null when range header is missing", () => {
      expect(parseRange(null, 1000)).toBeNull();
    });

    it("parses valid start and end byte offsets", () => {
      expect(parseRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
      expect(parseRange("bytes=500-999", 1000)).toEqual({ start: 500, end: 999 });
    });

    it("clamps end offset to size - 1", () => {
      expect(parseRange("bytes=0-2000", 1000)).toEqual({ start: 0, end: 999 });
    });

    it("parses suffix range like bytes=-500", () => {
      expect(parseRange("bytes=-500", 1000)).toEqual({ start: 500, end: 999 });
    });

    it("parses open-ended range like bytes=500-", () => {
      expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    });

    it("rejects invalid range headers", () => {
      expect(parseRange("bytes=500-100", 1000)).toBe("invalid");
      expect(parseRange("bytes=abc-def", 1000)).toBe("invalid");
      expect(parseRange("bytes=1500-2000", 1000)).toBe("invalid");
      expect(parseRange("items=0-10", 1000)).toBe("invalid");
    });
  });
});

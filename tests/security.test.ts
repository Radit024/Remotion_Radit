import { describe, it, expect } from "vitest";
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

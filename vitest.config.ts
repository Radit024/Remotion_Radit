import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/render.integration.test.ts", "node_modules", ".next"],
    environmentMatchGlob: [
      ["tests/editor.test.tsx", "jsdom"],
      ["src/**/*.test.tsx", "jsdom"],
    ],
    setupFiles: ["tests/setup.ts"],
  },
});

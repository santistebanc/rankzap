import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so the tests do not start the Cloudflare Worker plugin.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    environment: "node",
  },
});

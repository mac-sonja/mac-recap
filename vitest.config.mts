import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
    // test/db/** needs the local Supabase stack: `npm run test:db` (vitest.db.config.mts).
    exclude: [...configDefaults.exclude, "test/db/**"],
    testTimeout: 30_000,
  },
});

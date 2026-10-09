import { configDefaults, mergeConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// DB suite: runs against the local Supabase stack (Docker). Started only by
// `npm run test:db` (scripts/test-db.sh), never by `npm test`.
// mergeConfig concatenates arrays, so drop the base include/exclude first
// (the base exclude contains test/db/** and would exclude this whole suite).
const baseTest = { ...base.test };
delete baseTest.include;
delete baseTest.exclude;

export default mergeConfig(
  { ...base, test: baseTest },
  {
    test: {
      include: ["test/db/**/*.test.ts"],
      exclude: [...configDefaults.exclude],
      // Tests share one database and mutate seed rows; run files one at a time.
      fileParallelism: false,
    },
  },
);

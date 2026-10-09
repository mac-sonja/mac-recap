import { getEnv } from "@/shared/env";

// Node.js-only half of `register()`: a missing or invalid variable stops the
// process before it serves any request.
export function assertEnvOrExit(): void {
  try {
    getEnv();
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    process.exit(1);
  }
}

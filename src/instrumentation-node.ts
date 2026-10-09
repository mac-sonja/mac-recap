import { getEnv, getGateCredentials } from "@/shared/env";

// Node.js-only half of `register()`: a missing or invalid variable stops the
// process before it serves any request. The basic-auth gate check is web-only;
// the worker validates `getEnv()` alone.
export function assertEnvOrExit(): void {
  try {
    getEnv();
    getGateCredentials();
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    process.exit(1);
  }
}

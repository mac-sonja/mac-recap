import { getEnv, getGateCredentials, resolveGateCredentials } from "@/shared/env";

// Node.js-only half of `register()`: a missing or invalid variable stops the
// process before it serves any request. The basic-auth gate check is web-only;
// the worker validates `getEnv()` alone.
//
// `assumeProduction` is for the preflight (`src/preflight.ts`), which only ever
// runs in front of the standalone `server.js`. That server forces
// NODE_ENV=production after the preflight has run, so the gate rule is evaluated
// as production there whatever NODE_ENV the container was started with.
export function assertEnvOrExit({ assumeProduction = false }: { assumeProduction?: boolean } = {}): void {
  try {
    const env = getEnv();
    if (assumeProduction) resolveGateCredentials({ ...env, NODE_ENV: "production" });
    else getGateCredentials();
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    process.exit(1);
  }
}

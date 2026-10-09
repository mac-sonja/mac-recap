// Runs once when the Next.js server starts. `process.exit` exists only in the
// Node.js runtime, so the check is loaded only there; Next inlines
// `NEXT_RUNTIME` at build time, which is why it is read here and not via env.ts.
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax -- build-time constant inlined by Next, not configuration
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnvOrExit } = await import("./instrumentation-node");
    assertEnvOrExit();
  }
}

import { assertEnvOrExit } from "./instrumentation-node";

// Bundled to `dist/preflight.js` and loaded with `node --require` ahead of the
// standalone `server.js`, which opens the port before Next runs `register()`.
// Running the same check here first means a web process with a missing or
// invalid variable exits 1 before it ever listens. The rules live in
// `@/shared/env`; `register()` still runs them for `next dev` / `next start`.
// The gate is checked as production: server.js forces NODE_ENV=production, so a
// container started with NODE_ENV=development or test must not pass ungated.
assertEnvOrExit({ assumeProduction: true });

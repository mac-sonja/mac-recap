import { runWorker } from "./run";

// Worker entry point, bundled to `dist/worker.js`. It runs as its own process
// (often PID 1 in a container), so it installs its own signal handlers.
void runWorker({
  on: (signal, listener) => process.on(signal, listener),
  exit: (code) => process.exit(code),
});

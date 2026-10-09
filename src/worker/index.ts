import { getEnv } from "@/shared/env";
import { log } from "@/shared/log";

// Worker entry point. The job loop and the bundle (`dist/worker.js`) arrive in
// Story 2.2; for now it only validates the environment and reports that it started.
getEnv();
log.info("worker started");

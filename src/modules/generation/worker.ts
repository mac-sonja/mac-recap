// Worker-only entry of the generation module (Story 3.7). Only src/worker imports
// this file (AD-10; test/web-imports.test.ts); index.ts never imports it. Story 3.6's
// narrative generator (and the Anthropic SDK) will be wired in here.
import { randomUUID } from "node:crypto";
import { getSystemActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { JobHandler } from "@/modules/jobs";
import * as material from "@/modules/material";
import { makeGenerateHandler, type GenerateDeps } from "@/modules/generation/application/generate-case";

/**
 * The `generate` job handler, wired to the real use cases. Register it in the
 * worker as `{ generate: generateHandler() }`. `overrides` replaces single
 * dependencies (tests, or the text source Story 3.6 provides).
 */
export function generateHandler(overrides: Partial<GenerateDeps> = {}): JobHandler {
  return makeGenerateHandler({
    getSystemActor,
    getCase: caseStudy.get,
    hasMaterial: material.hasMaterial,
    buildManifest: material.buildManifest,
    getDetailsForm: material.getDetailsForm,
    transition: caseStudy.transition,
    createWorkingRevision: caseStudy.createWorkingRevision,
    recordEvent: caseStudy.recordEvent,
    newId: randomUUID,
    ...overrides,
  });
}

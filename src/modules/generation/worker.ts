// Worker-only entry of the generation module (Story 3.7). Only src/worker imports
// this file (AD-10; test/web-imports.test.ts); index.ts never imports it. It wires
// Story 3.6's narrative generator, the only importer path of the Anthropic SDK.
import { randomUUID } from "node:crypto";
import { getSystemActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { JobHandler } from "@/modules/jobs";
import * as material from "@/modules/material";
import { createAnthropicNarrativeGenerator } from "@/modules/generation/adapters/anthropic/narrative-generator";
import { createDocumentReader } from "@/modules/generation/adapters/documents/document-reader";
import { makeGenerateHandler, type GenerateDeps } from "@/modules/generation/application/generate-case";
import { makeNarrativeTextSource } from "@/modules/generation/application/narrative-text-source";
import { testDraftTextSource, type TextSource } from "@/modules/generation/application/text-source";
import { getEnv } from "@/shared/env";
import { log } from "@/shared/log";

/**
 * The text source the worker uses: the AI (Story 3.6) when `ANTHROPIC_API_KEY` is set,
 * else the marked test text, so a local worker without a key still generates.
 */
export function workerTextSource(env: { ANTHROPIC_API_KEY?: string } = getEnv()): TextSource {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) {
    log.warn("ANTHROPIC_API_KEY is not set: generate writes the test text");
    return testDraftTextSource;
  }
  return makeNarrativeTextSource({
    generator: createAnthropicNarrativeGenerator({ apiKey }),
    documents: createDocumentReader(),
    readAssetBytes: material.readAssetBytes,
    getClientInfo: caseStudy.getClientInfoForCase,
  });
}

/** The worker's text source, chosen on the first job (the environment is read then, not at registration). */
function lazyWorkerTextSource(): TextSource {
  let chosen: TextSource | undefined;
  return { texts: (input) => (chosen ??= workerTextSource()).texts(input) };
}

/**
 * The `generate` job handler, wired to the real use cases. Register it in the
 * worker as `{ generate: generateHandler() }`. `overrides` replaces single
 * dependencies (tests).
 */
export function generateHandler(overrides: Partial<GenerateDeps> = {}): JobHandler {
  return makeGenerateHandler({
    getSystemActor,
    getCase: caseStudy.get,
    hasMaterial: material.hasMaterial,
    listGenerationAssets: material.listGenerationAssets,
    getDetailsForm: material.getDetailsForm,
    transition: caseStudy.transition,
    createWorkingRevision: caseStudy.createWorkingRevision,
    recordEvent: caseStudy.recordEvent,
    newId: randomUUID,
    textSource: lazyWorkerTextSource(),
    ...overrides,
  });
}

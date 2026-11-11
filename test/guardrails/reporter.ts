import type { Reporter, TestModule } from "vitest/node";
import { GUARDRAIL_TAG, GUARDRAILS } from "./suite";

/**
 * Prints one result per guardrail after `npm run test:guardrails`: passed or failed, with its
 * test count. A guardrail with no test that ran, or with a failed one, fails the run, so a
 * tag that is renamed away can't empty a guardrail silently.
 */
export default class GuardrailReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const tally = new Map<string, { passed: number; failed: number }>(GUARDRAILS.map((g) => [g, { passed: 0, failed: 0 }]));
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        const state = test.result().state;
        if (state !== "passed" && state !== "failed") continue;
        const guardrail = GUARDRAIL_TAG.exec(test.fullName)?.[1];
        if (guardrail === undefined) continue;
        const counts = tally.get(guardrail) ?? { passed: 0, failed: 0 };
        counts[state] += 1;
        tally.set(guardrail, counts);
      }
    }
    const lines = ["", " Guardrails"];
    let ok = true;
    for (const [guardrail, { passed, failed }] of [...tally].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))) {
      const verdict = failed > 0 ? "FAILED" : passed === 0 ? "NO TEST RAN" : "passed";
      if (verdict !== "passed") ok = false;
      lines.push(`   ${guardrail.padEnd(5)} ${verdict.padEnd(12)} ${passed} passed, ${failed} failed`);
    }
    lines.push("");
    process.stdout.write(`${lines.join("\n")}\n`);
    if (!ok) process.exitCode = 1;
  }
}

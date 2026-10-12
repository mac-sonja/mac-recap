---
title: 'Story 2.4 (part 3): Lint rule against hard-coded UI strings'
type: 'feature'
created: '2026-10-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.4 requires every UI string to come from the Italian dictionary (`src/shared/i18n/it.ts`), but nothing stops a component from hard-coding text, so English or stray copy can slip into the tool.

**Approach:** Extend the `src/app` lint layer in `eslint.config.mjs` (through its `extraSyntax`, so the layer's existing `no-restricted-syntax` entries stay) to reject, in `src/app/**/*.tsx` except `*.test.tsx`: JSX text containing a letter; a string literal (or a template literal with no expressions) that is a JSX child; and a string literal value of `aria-label`, `title`, `placeholder` or `alt`. Text with no letters (punctuation, numbers, whitespace) stays allowed. The message points to `src/shared/i18n/it.ts`. Add pass/fail cases to `test/lint-boundaries.test.ts` for each, plus one proving test files are exempt, and keep `npm run lint` green on the current code.

</frozen-after-approval>

## Implementation Notes

- `eslint.config.mjs`: a `UI_STRINGS` selector list, applied by a new layer for `src/app/**/*.tsx` (ignoring `*.test.tsx`) placed after the general `src/app` layer. A later flat-config entry replaces `no-restricted-syntax` wholesale, so the new layer repeats `OUTSIDE_MODULES` and adds `UI_STRINGS` through `extraSyntax`; the import and `process.env` bans still apply (tested).
- "Letter" is `[A-Za-zÀ-ɏ]` (ASCII plus Latin-1 and Latin Extended-A/B), which covers Italian and English.
- `test/lint-boundaries.test.ts`: fail cases for JSX text, string/template/ternary/`&&` children, and every attribute in every form (literal, braces, template, ternary, `??`); pass cases for dictionary use, `t()`, letterless text incl. × ÷, non-UI attributes and templates with only expressions; the test-file exemption; boundary rules still active. The fixture exports the dictionary import and an `ok` flag so unrelated rules stay quiet.
- After review: ternary, `&&` and `??` branches are also checked, and × / ÷ are excluded from "letter".
- Current `src/app` code passes the rule unchanged.

## Review Triage Log

- [medium, patched] String literals in `cond ? "a" : "b"` / `a && "b"` children and UI attributes passed — a common bypass; added the conditional and logical branches.
- [low, patched] "Letter" range included × (U+00D7) and ÷ (U+00F7), so a close glyph would fail; excluded them.
- [low, patched] Not every attribute was tested in every form; the tests now cover each attribute × form.
- [low, deferred] Templates with an expression and literal text (`Ciao ${name}`) pass; enforcing it needs a parameterised dictionary accessor first.
- [low, deferred] Text-bearing props beyond the four attributes (`aria-description`, `aria-valuetext`, component `label`/`description`) are unchecked; widen the list when those props appear.
- [low, rejected] `.jsx` files and `metadata` objects aren't covered — the repo has no `.jsx`, and the only `metadata` uses the dictionary.
- [low, rejected] `*.spec.tsx` isn't exempt — Vitest only runs `*.test.*`, so spec files aren't a convention here.
- [low, rejected] No documented escape hatch — a reasoned `eslint-disable-next-line` is the standard route.
- [low, rejected] The `.tsx` layer duplicates `OUTSIDE_MODULES` and could drift — both layers use the same constant, and a test asserts the boundary rules still apply to components.
- [false] "Spec case count wrong" — the count matched; the notes are rewritten anyway.
</content>

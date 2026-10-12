---
title: 'Story 2.4 (part 1): App shell — navigation, tokens, Italian copy, status badge'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd11607696c41faf8e8c22f1b4963bc5e0ac0a9a3'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every later screen needs one frame, one vocabulary and one status language, and none exists: no tokens, no dictionary, no navigation, no role-aware redirect.

**Approach:** Theme tokens with placeholder values in `globals.css`, one Italian dictionary in `src/shared/i18n/`, a `(tool)` layout with a role-aware left sidebar, a role→landing map in `access`, and a `StatusBadge`.

## Boundaries & Constraints

**Always:** Token names exactly as DESIGN.md: colours `surface, surface-raised, foreground, foreground-muted, border, primary, primary-foreground, focus-ring, danger, status-draft|generating|review|approved`; fonts `display, heading, body, label, mono`; rounding `sm, md, full`. Components read tokens only (Tailwind theme utilities), never raw colours or font stacks. Every UI string comes from `src/shared/i18n/it.ts`. Nav items and surface access derive from the `access` policy (`can`), never role names in UI code. Status labels per IR-OP8. Visible focus uses `focus-ring` on every control. **Decision (placeholders):** neutral greyscale for chrome, four clearly distinct hues for status, system font stacks, no web fonts. **Decision (routes):** `/` and any unusable surface redirect to the actor's landing; owner/designer landing `/case-studies` (placeholder page; the table is Story 2.6). **Decision (user menu):** shows the actor's display name and role label; no sign-out until Epic 6 (absent, not disabled). **Decision (scope split):** the accessible single-level Dialog and the hard-coded-string lint rule are Story 2.4 part 2. **Decision (no UI guidelines, 2026-10-12):** build now on the placeholder tokens; the guidelines later change token values only. **Decision (shell strings, Claude draft accepted by the user):** new-case-study action "Nuovo case study"; nav item "Case study"; sidebar accessible name "Navigazione principale"; user-menu button "Menu utente"; role labels "Owner/designer", "Account/sales/social", "Amministratore"; Case studies placeholder heading "Case study"; no-actor message "Non è stato possibile identificare il tuo profilo. Ricarica la pagina; se il problema continua, contatta un amministratore."

**Never:** No To review (4.1), Templates (IR-C4) or Users (6.3) entries or routes. No Case studies table, wizard or skeletons. No below-1024 px layout. No dialogs. No new permissions; no role checks outside `access`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owner/designer, ≥1280 px | dev actor | sidebar: new-case-study action, Case studies, user menu; no Users/Templates/To review in the DOM | N/A |
| 1024–1279 px | same | sidebar shows icons only; labels kept for screen readers | N/A |
| Root or unusable surface | owner/designer opens `/` or a surface whose action `can` denies | redirect to `/case-studies` | N/A |
| No actor | `getActor()` → `UNAUTHENTICATED` or lookup error | dictionary message page, no shell, no nav | N/A |
| StatusBadge | each of draft, generating, in_review, approved | label Bozza / In elaborazione / Da approvare / Approvato with its `status-*` token | unknown status: type error |

</frozen-after-approval>

## Code Map

- `src/app/layout.tsx` (`<html lang="it">`, imports `globals.css`), `src/app/page.tsx` (placeholder, `await connection()`), `src/app/globals.css` (only `@import "tailwindcss"`) -- Tailwind 4 CSS-first: tokens go in `@theme` as `--color-*`, `--font-*`, `--radius-*`.
- `components.json` -- shadcn aliases `@/app/_components`, utils `@/shared/utils` (`cn`). No shadcn/radix/lucide installed; add `lucide-react` (exact pin, latest version published ≥2 weeks ago) for sidebar icons only.
- `src/modules/access/index.ts` -- exports `getActor`, `authorize`, types. Add `can(actor, action, resource?)` (wraps `domain/policy.ts` `can`) and `landingFor(role)` (owner_designer `/case-studies`, account_sales_social `/library`, admin `/users`, system none). Matrix stays only in `policy.ts`.
- `src/modules/access/domain/policy.ts` -- `CASE_STATUSES`, `CaseStatus` (reuse for StatusBadge); actions `create case`, `list cases`.
- `eslint.config.mjs` -- `src/app/**` uses the `OUTSIDE_MODULES` layer; `lucide-react` is allowed there.
- `src/proxy.ts` -- basic-auth only; do not add routing here.
- Pages are not server actions; `test/authorize-guard.test.ts` does not apply, but pages resolve the actor via `getActor()`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- `@theme` tokens per Boundaries; `:focus-visible` uses `focus-ring`; `prefers-reduced-motion` respected
- [x] `src/shared/i18n/it.ts` (+ typed accessor) -- every shell string, status labels, role labels, no-actor message
- [x] `src/modules/access/index.ts`, `domain/landing.ts` + tests -- `can`, `landingFor`
- [x] `src/app/(tool)/layout.tsx`, `_components/sidebar.tsx`, `user-menu.tsx` -- actor resolve, no-actor page, nav from `can` (`create case`, `list cases`), collapse at 1024–1279 px
- [x] `src/app/page.tsx`, `src/app/(tool)/case-studies/page.tsx`, `src/app/_lib/surface.ts` + test -- root redirect; `requireSurface(action)` guard redirecting to `landingFor`
- [x] `src/app/_components/status-badge.tsx` + test (add Vitest jsdom/Testing Library with exact pins only if needed)
- [x] `test/tokens.test.ts` -- every token name exists in `globals.css`; no raw hex/rgb/hsl colours or font stacks in `src/app/**/*.tsx`
- [x] `README.md` -- tokens and dictionary; template renderers (Epic 3) never consume tool tokens

**Acceptance Criteria:**
- Given a token value changed in `globals.css`, when the app renders, then the UI changes with no component edit.
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.

## Implementation Notes

- `lucide-react` pinned at 1.48.0 (2026-09-24, the latest ≥2 weeks old).
- `@theme` clears Tailwind's default `--color-*`, `--font-*`, `--radius-*`, so only DESIGN.md tokens exist as utilities.
- No jsdom/Testing Library added: component tests render with `react-dom/server` in the node environment; Vitest `include` now also picks up `src/**/*.test.tsx`.
- `resolveShellActor` (React `cache`, per request) is shared by the `(tool)` layout, pages and `/`; a role with no landing (`system`) is treated as no actor.
- The new-case-study action links to `/case-studies/new`, a placeholder heading guarded by `requireSurface("create case")`; the wizard replaces it in Story 2.5.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind, edge | "Nuovo case study" links to `/case-studies/new`, which has no page | medium | Every owner/designer click on the primary action is a 404; a guarded placeholder reuses an existing string | patch |
| 2 | verification-gap, blind | Layout wiring (nav from `can`, role label, NoActor) untested | medium | `sidebar.test.tsx` passes hard-coded props; swapping the actions or dropping the NoActor branch passes every test | patch |
| 3 | verification-gap, blind | `/` redirect and the case-studies page guard untested | medium | Helper tests take the action from the test; neither page module is ever run | patch |
| 4 | verification-gap | Token test doesn't check that Tailwind's defaults are cleared | low | Removing a reset lets default classes through unnoticed; one-assertion fix | patch |
| 5 | verification-gap, blind | UserMenu toggle and Escape focus-return untested | low | No DOM test environment; behaviour not in the matrix | defer |
| 6 | blind, edge | `/library` and `/users` landings 404 for account/sales/social and admin | false | Until Epic 6, `getActor()` returns only the dev owner/designer; Stories 5.1 and 6.3 add those routes before real users exist | reject |
| 7 | blind, edge | Account/sales/social sidebar would be empty (`list cases` unscoped) | false | Unreachable before Epic 6 for the same reason; Story 5.1 adds the library entry | reject |
| 8 | blind, edge | `requireSurface` can loop if a landing page denies its own action | low | The only landing page today (`/case-studies`) is allowed for its role; no fix without a page to guard | reject |
| 9 | blind | `it.role` / `it.status` not typed against `Role` / `CaseStatus` | low | Typing them needs `src/shared` to import `access` types, which the layer rules forbid | reject |
| 10 | blind, edge | User menu doesn't close on an outside click or blur; name hidden from the collapsed button's label | low | Escape works; adding pointer listeners is new behaviour beyond the matrix | reject |
| 11 | blind | "Desktop only" not enforced below 1024 px | false | Frozen Never: "No below-1024 px layout" | reject |
| 12 | blind | No skip link; `role="alert"` on static content; no-actor page returns 200 | low | Single-nav shell; 401/403 handling arrives with Epic 6 login | reject |
| 13 | blind | Dictionary export `it` clashes with Vitest's `it` | low | Aliasing in tests works; a rename touches every consumer | reject |
| 14 | blind, edge | "Case study" nav loses active state on sub-routes | low | `/case-studies/new` should not mark the list active; detail routes don't exist yet | reject |
| 15 | blind | StatusBadge "covers every case status" test is redundant | false | It fails when a status is added, prompting a new label and token | reject |
| 16 | blind, edge | Vitest doesn't include `test/**/*.tsx`; token scan skips `.ts` | low | No such files exist | reject |
| 17 | edge | `getActor` throwing reaches the Next error page | low | `getActor` returns `Result`; only a missing env, which fails at startup, throws | reject |
| 18 | edge | Empty `displayName` shows an empty line | low | `profile.display_name` is set by seed and Epic 6 admin flows | reject |
| 19 | edge | StatusBadge with an unknown runtime status renders empty | false | The prop is typed `CaseStatus`; data reaches it through zod-validated rows | reject |
| 20 | edge | `t()` with a cast key throws TypeError, not the documented error | low | Keys are type-checked; only a cast reaches it | reject |
| 21 | edge | Token regexes may false-positive (`#abc` href, "serif" in a comment) | low | Copy lives in `it.ts`, not `.tsx`; none occurs today; fails loudly if it does | reject |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0

**Manual checks (if no CLI):**
- `npm run dev` with `.env.local` and no gate vars: at 1440 px the sidebar shows the items; at 1100 px icons only; `/` lands on `/case-studies`; Tab shows the focus ring.

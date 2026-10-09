---
title: 'Story 2.4 (part 1): App shell — navigation, tokens, Italian copy, status badge'
type: 'feature'
created: '2026-10-09'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every later screen needs one frame, one vocabulary and one status language, and none exists: no tokens, no dictionary, no navigation, no role-aware redirect.

**Approach:** Theme tokens with placeholder values in `globals.css`, one Italian dictionary in `src/shared/i18n/`, a `(tool)` layout with a role-aware left sidebar, a role→landing map in `access`, and a `StatusBadge`.

## Boundaries & Constraints

**Always:** Token names exactly as DESIGN.md: colours `surface, surface-raised, foreground, foreground-muted, border, primary, primary-foreground, focus-ring, danger, status-draft|generating|review|approved`; fonts `display, heading, body, label, mono`; rounding `sm, md, full`. Components read tokens only (Tailwind theme utilities), never raw colours or font stacks. Every UI string comes from `src/shared/i18n/it.ts`. Nav items and surface access derive from the `access` policy (`can`), never role names in UI code. Status labels per IR-OP8. Visible focus uses `focus-ring` on every control. **Decision (placeholders):** neutral greyscale for chrome, four clearly distinct hues for status, system font stacks, no web fonts. **Decision (routes):** `/` and any unusable surface redirect to the actor's landing; owner/designer landing `/case-studies` (placeholder page; the table is Story 2.6). **Decision (user menu):** shows the actor's display name and role label; no sign-out until Epic 6 (absent, not disabled). **Decision (scope split):** the accessible single-level Dialog and the hard-coded-string lint rule are Story 2.4 part 2.

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

## Open Questions

- **Italian shell strings** (you chose to supply them). Needed: the new-case-study action, the Case studies nav item, the sidebar's accessible name, the user-menu button label, the three role labels (owner/designer, account/sales/social, admin), the Case studies placeholder page heading, and the no-actor message.

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
- [ ] `src/app/globals.css` -- `@theme` tokens per Boundaries; `:focus-visible` uses `focus-ring`; `prefers-reduced-motion` respected
- [ ] `src/shared/i18n/it.ts` (+ typed accessor) -- every shell string, status labels, role labels, no-actor message
- [ ] `src/modules/access/index.ts`, `domain/landing.ts` + tests -- `can`, `landingFor`
- [ ] `src/app/(tool)/layout.tsx`, `_components/sidebar.tsx`, `user-menu.tsx` -- actor resolve, no-actor page, nav from `can` (`create case`, `list cases`), collapse at 1024–1279 px
- [ ] `src/app/page.tsx`, `src/app/(tool)/case-studies/page.tsx`, `src/app/_lib/surface.ts` + test -- root redirect; `requireSurface(action)` guard redirecting to `landingFor`
- [ ] `src/app/_components/status-badge.tsx` + test (add Vitest jsdom/Testing Library with exact pins only if needed)
- [ ] `test/tokens.test.ts` -- every token name exists in `globals.css`; no raw hex/rgb/hsl colours or font stacks in `src/app/**/*.tsx`
- [ ] `README.md` -- tokens and dictionary; template renderers (Epic 3) never consume tool tokens

**Acceptance Criteria:**
- Given a token value changed in `globals.css`, when the app renders, then the UI changes with no component edit.
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0

**Manual checks (if no CLI):**
- `npm run dev` with `.env.local` and no gate vars: at 1440 px the sidebar shows the items; at 1100 px icons only; `/` lands on `/case-studies`; Tab shows the focus ring.

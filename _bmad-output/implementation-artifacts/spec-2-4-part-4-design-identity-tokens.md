---
title: 'Story 2.4 part 4: Apply the DESIGN.md visual identity to the theme'
type: 'chore'
created: '2026-10-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/globals.css` still has the light, greyscale placeholder token values from Story 2.4. DESIGN.md (2026-10-14) now gives the real identity: black page, grey surfaces, lime main calls to action with black labels, blue secondary emphasis, Inter and JetBrains Mono, tight radii, and tinted status pills with no dot. The sidebar should show the white MAC wordmark in place of the "MAC Recap" text.

**Approach:**
- Swap the token values in `@theme` to DESIGN.md's frontmatter values, keeping every existing token name.
- Add the tokens DESIGN.md defines that are missing: `surface-control`, `surface-selected`, `border-strong`, `foreground-strong`, `accent`, `info`, `danger-foreground`, and `radius-lg`.
- Load Inter and JetBrains Mono with `next/font/google`. Every family token points at Inter, except `mono`, which points at JetBrains Mono.
- Set the page to a dark color scheme.
- Restyle `StatusBadge` to DESIGN.md's status badge: a tinted fill and border (Tailwind opacity modifiers on the `status-*` tokens), the status-coloured label, `info` text for *Da approvare*, and no dot.
- Replace the sidebar's text title with the white wordmark, as an inline SVG with `fill="currentColor"` on `text-foreground`. Its accessible name stays `it.app.name`.
- Fix anything the swap makes unreadable on dark surfaces. For example, the dialog backdrop `bg-foreground/50` becomes a dark scrim.
- Update `test/tokens.test.ts` (new names, `radius-lg`) and the status-badge test.
- Components keep using tokens only: no raw colours or font stacks in `.tsx`, as `test/tokens.test.ts` enforces. Template output is untouched.

</frozen-after-approval>

## Implementation Notes

- `globals.css`: DESIGN.md hex values in `@theme`; new tokens `surface-control`, `surface-selected`, `border-strong`, `foreground-strong`, `accent`, `info`, `danger-foreground`, `radius-lg`, and `text-badge` (13px); `color-scheme: dark`. Font tokens point at `--font-inter` / `--font-jetbrains-mono` from `next/font/google` on `<html>` (`layout.tsx`).
- `StatusBadge`: tinted pill per DESIGN.md (opacity modifiers on `status-*`), `info` text for *Da approvare*, no dot. *Bozza* and *In elaborazione* look the same by design and differ by label.
- `MacWordmark` (`_components/mac-wordmark.tsx`): paths from `imports/brand/MAC-logo.svg`, `fill="currentColor"` on `text-foreground`; sidebar title replaced. Still hidden in the collapsed sidebar, like the old text.
- Dark-theme fixes: hover → `surface-control`, active nav → `surface-selected` + `text-foreground` (muted on selected fails 4.21:1); search field `surface-control`; panels and dialog `rounded-lg`; dialog backdrop `bg-surface/70`; headings `font-medium`, table headers regular weight.
- Not visually checked in a browser: the app needs a dev Supabase project in `.env.local` to start. Verified with lint, typecheck, 1227 tests and the build.

## Review Triage Log

- Hover/active on raised panels turned black after the swap — medium, real — patched (`surface-control` / `surface-selected`).
- New tokens unused; search field and panel radii off DESIGN.md — low, real for field and radii — patched; unused tokens are for the wizard.
- `font-semibold` on headings and table headers — low, real — patched.
- Badge `text-[13px]` raw size — low, real — patched with `--text-badge`.
- Badge tests too loose (any alpha, weak no-dot check) — low, real — patched with exact tones and a single-span check.
- Wordmark and active state untested — low, real — sidebar tests added.
- Wordmark hidden below `xl` — low, pre-existing (the text title was hidden too); DESIGN.md is silent on the collapsed sidebar — deferred.
- No test ties CSS values to DESIGN.md frontmatter — low, rejected: adds a frontmatter parser for drift that review catches.
- Dialog scrim `surface/70` barely dims a dark page — low, rejected: the dialog is set apart by its raised surface and border; revisit visually.
- Spec incomplete at review time — false: finalized here.
- JetBrains Mono preloaded on every page — low, rejected: negligible payload for an internal desktop tool.

---
name: mac-recap-ui
description: House rules for MAC Recap's tool UI — tokens, light and dark themes, layout rhythm, copy voice, calls to action and motion. Use whenever building, restyling or reviewing a screen, a component or any Italian UI string in this repo. Builds on emil-design-eng, apple-design and animate (Emil Kowalski's skills, MIT, copied in .claude/skills).
---

# MAC Recap UI

The tool should feel current and precise, like an Apple app: calm surfaces, crisp type,
instant response. The words sound like a friendly communication agency talking to
people with very different backgrounds. Visual refresh: 2026-10-20.

## Tokens, never raw values

- Every colour, radius, shadow, easing and font comes from `src/app/globals.css`
  (`@theme`). Components use utilities (`bg-surface-raised`, `text-foreground-muted`,
  `shadow-card`, `ease-out`). `test/tokens.test.ts` fails on a raw colour or font stack
  in a component.
- A new token goes in `@theme` (light value) **and** in both dark blocks
  (`:root[data-theme="dark"]` and the `prefers-color-scheme: dark` block, which must
  stay identical — a test checks it).
- New `shadow-*` or `text-*` size tokens must be added to `extendTailwindMerge` in
  `src/shared/utils.ts`, or `cn()` may merge them away.

## Light and dark

- Light (default): warm paper page `surface`, white cards `surface-raised`, warm grey
  controls. Dark: the original black UI.
- The theme follows the system ("Automatico") unless the person picks Chiaro/Scuro
  in the sidebar; the choice is a cookie (`mac-theme`) read by the root layout, so the
  first paint is right. No inline script, no flash.
- Lime (`primary`) is a fill, never text on light surfaces. Focus ring is blue in light,
  lime in dark (`focus-ring`).
- Check every screen in both themes before calling it done.

## Layout rhythm

- Tool pages: `PageHeader` (title, one-line lead, main action on the right), then the
  content, `gap-8`. Content max width `max-w-6xl`.
- Lists live in a `CARD` (white, hairline + soft shadow — no solid borders). Tables:
  `TH` headers, rows `py-3.5`, names `font-medium text-foreground-strong`, codes in mono
  muted.
- Status always as `StatusBadge`: tint + dot + label. Colour is never the only signal.
- Shared class constants: `src/app/_components/button-styles.ts` (`PRIMARY_ACTION`,
  `SECONDARY_ACTION`, `DANGER_ACTION`, `PRESSABLE`) and `field-styles.ts` (`FIELD`,
  `TEXTAREA`, `FIELD_LABEL`, `FIELD_HINT`, `SEARCH_FIELD`, `CARD`, `TH`, `STEP_HEADING`).

## Copy voice (src/shared/i18n/it.ts)

- Every string lives in the dictionary. Friendly agency tone: "noi" for the product
  ("Non siamo riusciti a salvare"), "tu" for the person, plain verbs, no jargon, no
  exclamation marks (a test checks it).
- Say what happened and what to do next in one breath: "Non salvato. Modifica il testo
  per riprovare."
- Empty states invite, they don't scold: "Niente da rivedere. Goditi il momento."
- Domain words: *case* (not "case history"), *Area* (the business line), *Bozza / In
  creazione / Da rivedere / Approvata*.

## Calls to action

- At most three words, verb first when it is an action ("Aggiungi cliente", "Inizia
  ora", "Crea la prima"). A test checks length and uniqueness of the main ones.
- One primary (lime) action per view. Never the same label twice on one screen: the
  sidebar says *Nuova case*, so a page offers its own wording (*Racconta un progetto*,
  *Crea la prima*).
- Secondary actions use `SECONDARY_ACTION`; destructive ones `DANGER_ACTION` and a
  confirmation dialog.

## Motion (see emil-design-eng, animate)

- Ask first: should this animate at all? Things used tens of times a day (nav, theme
  switch, filters) change instantly or with a ≤150 ms colour transition.
- Buttons and cards respond on press: `active:scale-[0.97]` (`PRESSABLE`).
- Entrances only, ≤ 300 ms, `ease-out` (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`),
  never from `scale(0)`; popovers grow from their trigger (`origin-*`), modals stay
  centred (`animate-dialog-in`). Never `ease-in`, never `transition: all`.
- Only animate `transform` and `opacity`. Stagger 30–80 ms, decorative only.
- `prefers-reduced-motion` shortens every animation to an instant (globals.css).

## Before you ship

Run `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, then look at the screen in
both themes at 1280 px and 1440 px. For edge cases, run the break-ui skill.

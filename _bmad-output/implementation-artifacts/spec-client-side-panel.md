---
title: 'Client side panel: add and edit a client in one sectioned form'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: '103ad7b8433661571595176efa21de83c136debf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adding or editing a client is a full-page two-step wizard (`/clients/new`: Dettagli, then Materiale), unlike the owner's mock: one panel at the side of the Clienti list, divided into sections like the case Dettagli step.

**Approach:** A right-side panel (sheet, ~500 px, full height) opens over the Clienti list (**Nuovo cliente**) and over the client's page (**Modifica cliente**). One scrolling form in numbered white cards (`FieldCard`): **01 Dettagli** (Nome, Settore, Descrizione), **02 Logo e immagini** (logo + 3 image slots), **03 Racconto** (Contesto, Soluzione, Risultati as today). Footer: **Annulla** + lime **Aggiungi** (new) or **Salva** (edit). The client page also gets an inactive **Modifica layout** button.

## Boundaries & Constraints

**Always:**
- Owner decisions 2026-10-21: the panel replaces the wizard for both add and edit; `/clients/new` (with or without `clientId`) redirects to the matching panel URL.
- Copy (it.ts, friendly "noi/tu" tone): title **Nuovo cliente** / **Modifica cliente**; sub "Il codice si genera da solo e non cambia mai." (edit: the existing edit note with the code); Nome placeholder "Ragione sociale o nome del brand"; Descrizione hint "Da qui l'AI scrive la bozza dell'intro."; logo hint "Se lo sostituisci, il vecchio logo viene eliminato."; Immagini counter "{n} di 3", hint "Da 2 a 3, almeno {px} px sul lato corto. PNG, JPEG o WebP." (numbers from `clientMaterialLimits`); **Modifica layout** inactive with reason "Arriva con il configuratore".
- Same rules as today: every info field, the logo, the three brief texts and ≥ `minImages` images are needed before **Aggiungi**/**Salva** is active; the reason lists what is missing (`nextReason`). Server checks unchanged (image pixel check, logo, brief limits).
- A new client gets its id only on **Aggiungi**: picked logo and images wait in the browser, then upload in order create → logo → update → brief → images. In edit mode logo and images upload as soon as they are picked, as today.
- The panel is a modal sheet: focus moves in and returns to the opener, Esc and **Annulla** close it, closing with unsaved entries asks `wizard.unsavedConfirm` first. Owner/designer only (`manage clients`); hidden below 1024 px like the current buttons.
- Panel state lives in the URL (`/clients?nuovo=1`, `/clients/{id}?modifica=1`) so refresh and back work. After **Aggiungi** the client's page opens; after **Salva** the panel closes on the client's page.
- **Elimina cliente** moves to the bottom of the edit panel, behaviour unchanged.
- Both themes, tokens only, `FIELD`/`TEXTAREA`/`CHOICE_PILL`/`FieldCard` reused.

**Never:**
- No database or migration change. Settore stays multi-select and Risultati stays one text (follow-up PRs B and C in `deferred-work.md`).
- No configurator, intro or outro work; **Modifica layout** links nowhere.
- Don't change the case wizard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add happy path | all fields, logo, 2 images, **Aggiungi** | client created, files uploaded, client page opens | N/A |
| Add, upload fails after create | create ok, an image upload fails | panel stays open as **Modifica cliente** for the new id, the failed slot shows its error, **Salva** retries | row/slot error, nothing lost |
| Image too small / wrong type | picked file | slot shows the rejection, counter unchanged | as `checkFile` today |
| 4th image | 3 slots full | no more slot; nothing added | N/A |
| Close with entries | typed name, **Annulla** or Esc | confirm; cancel keeps the panel | N/A |
| Old wizard URL | `/clients/new?clientId=X&step=2` | redirect to `/clients/X?modifica=1` | unknown id → `/clients` |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/clients/new/page.tsx` -- current wizard page; becomes a redirect only.
- `src/app/(wizard)/clients/new/_components/client-details-step.tsx` -- `saveAndGo` (l.222) create/update order, `useClientLogo`, `useAutosaveFields` (brief, active once a client id exists), `showRefusal`, `ready`; logic moves into the panel form.
- `src/app/(wizard)/clients/new/_components/client-material-step.tsx` -- client material actions (`requestClientMaterialUpload` l.115, confirm, list, remove), `checkFile` pixel check (l.64), `ready` ≥ `minImages`.
- `src/app/(wizard)/clients/new/_components/delete-client-button.tsx` -- reuse as is inside the edit panel (its `Dialog` may open over the sheet; the sheet must not use `Dialog`'s single-open owner).
- `src/app/_components/dialog.tsx` -- native `<dialog>` pattern to copy for the sheet (focus return, `data-autofocus`); no sheet exists yet.
- `src/app/(wizard)/_components/field-card.tsx`, `src/app/_components/field-styles.ts` -- section cards and field styles.
- `src/app/(tool)/clients/page.tsx`, `_components/clients-table.tsx:137` -- "Aggiungi cliente" link → `/clients?nuovo=1`.
- `src/app/(tool)/clients/[clientId]/page.tsx:97-104` -- actions row: `EditClientButton` → `?modifica=1`, add inactive **Modifica layout**.
- `src/app/_lib/routes.ts:22` -- `clientWizardHref`; add panel href helpers, keep the old one only for the redirect.
- Tests to update: `clients/page.test.tsx:86-109`, `clients-table.test.tsx:137-147`, `edit-client-button.test.tsx:11`, `[clientId]/page.test.tsx:90`, `clients/new/page.test.tsx`, `client-details-step.test.tsx`, `client-material-step.test.tsx`, `it.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/_components/sheet.tsx` -- modal right-side sheet (native `<dialog>`, header, scroll body, sticky footer, focus handling, entrance ≤300 ms ease-out from the right) -- no sheet exists.
- [x] `src/app/(tool)/clients/_components/client-panel.tsx` (+ `client-image-slots.tsx`) -- the sectioned form, deferred uploads for a new client, immediate in edit, 3 image slot tiles (thumbnail + remove, "+ Aggiungi" empty) -- one form replaces both steps.
- [x] `src/app/(tool)/clients/page.tsx`, `[clientId]/page.tsx` -- read `nuovo`/`modifica`, load client + material server-side, render the panel; inactive **Modifica layout** -- panel over the right page.
- [x] `src/app/(wizard)/clients/new/page.tsx` -- redirect only; delete the step components and `client-steps.ts` once moved -- no dead wizard.
- [x] `src/app/_lib/routes.ts`, links in table, edit button -- point to panel URLs.
- [x] `src/shared/i18n/it.ts` -- new strings, remove unused wizard ones.
- [x] Tests for the sheet, the panel (add order, upload failure, edit immediate upload, unsaved confirm, slot limits), redirects, updated hrefs.

**Acceptance Criteria:**
- Given the Clienti list, when **Aggiungi cliente** is pressed, then the panel slides in from the right with the three sections and the list stays visible behind a scrim.
- Given a client page, when **Modifica cliente** is pressed, then the panel opens prefilled with the client's data, logo, images and brief, and **Elimina cliente** is at its bottom.
- Given a client page, then **Modifica layout** shows inactive with its reason linked by `aria-describedby`.
- Given light and dark themes at 1280 and 1440 px, the panel matches the mock's spacing and type.

## Implementation Notes

- Edit mode: a picked logo is uploaded (presign → PUT → confirm) at once, but linked to the client (`updateClient`, which deletes the old logo) only on **Salva**, so unsaved Nome/Settore/Descrizione edits are never sent half-way; closing without **Salva** leaves the new logo object unlinked, as a failed wizard save did before.
- The image slots take image types only (PNG, JPEG, WebP); a non-image file a client already has (older upload) keeps its slot with an icon and can be removed.
- A refused upload (pixels, type, size, limit) drops the slot and shows the reason under the slots; a failed upload (network, 5xx) keeps the slot with its error and **Salva** retries it.
- `DeleteClientButton` moved to `src/app/(tool)/clients/_components/`; the dictionary namespace `clientWizard` became `clientPanel`.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Edit: removing stored images (immediate) can leave < minImages and close without confirm | low | `client-image-slots.tsx:188` removes at once; same as the old Materiale step (immediate remove, could leave) | defer (pre-existing behaviour) |
| 2 | Browser Back while panel open loses entries without confirm | medium | `close()` guards Annulla/×/Esc only; no popstate handling in `client-panel.tsx` | patch |
| 3 | Open pushes, close replaces: duplicate history entry | low | Links push `?nuovo=1`, `close()` uses `router.replace` (:399) | patch |
| 4 | `images.announce.*` copy unused; slot upload/remove results not announced | medium | grep: `announce` only in client-panel for brief errors | patch |
| 5 | After create + later failure, list behind the panel lacks the new client | low | `replaceState` at :311, no `router.refresh()` | patch |
| 6 | Edit-mode logo picked then cancelled leaves an unlinked storage object | low | Implementation Notes accept it; the wizard did the same | defer |
| 7 | 0-byte file shows the retry message | low | `client-image-slots.tsx:170` uses `errors.failed` | patch |
| 8 | Logo hint MB unrounded; image limit/type copy hardcodes 3 and types | low | `client-panel.tsx:589`; `it.ts` images copy | patch |
| 9 | Logo hint "Se lo sostituisci…" shown only for an existing logo; spec and mock show it always | low | `logoReplaceHint` gated on `logo.kind === "current"` (:581) | patch |
| 10 | Footer reason still "Per andare avanti manca" | false | spec asks for `nextReason` explicitly; changing it edits the spec | reject |
| 11 | Counter "n di 3" disagrees with tiles when an old non-image file holds a slot | low | `imageCount` counts images, free slots use `slots.length` | patch (note on the tile) |
| 12 | Panel tests miss: logo SVG/small/stale pick, create refusal, double Aggiungi, logo link retry, edit rename Salva, image refusal/5xx/remove failure, brief autosave wiring, Esc with entries | medium | grep of `client-panel.test.tsx` (verification-gap, blind) | patch |
| 13 | **Modifica layout** has both `title` and `aria-describedby` with the same text | low | `[clientId]/page.tsx` | patch |
| 14 | Hardcoded `id="client-layout-reason"`, import order, null first render | low | rendered once; lint passes; hydration gate is deliberate | reject |
| 15 | A non-cancelable second Esc closes the native dialog while React still thinks it open | medium | `sheet.tsx` handles `cancel` only; Chrome makes repeat Esc non-cancelable | patch |
| 16 | Edit: confirmed discard still saves pending brief text on unmount flush | medium | `useAutosaveFields` flushes on unmount; `close()` does not cancel it | patch |
| 17 | Typing during a running save is lost on close | low | inputs disabled while pending (`disabled`), rare | reject |
| 18 | Unmapped 4xx / storage 4xx treated as retryable | low | `messageFor` default `final:false` (:108); catch-all retry | patch |
| 19 | In-panel link with unsaved info discards (old wizard saved first) | low | confirm says entries are unsaved; panel has no in-body links | reject |

## Verification

**Commands:**
- `npx vitest run` -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npx eslint .` -- expected: no errors

**Manual checks (if no CLI):**
- Add a client end to end on dev (logo + 2 images), edit it, close with unsaved entries, both themes.

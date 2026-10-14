/**
 * The Italian UI dictionary: every string the tool UI shows comes from here.
 * Plain verbs, no exclamation marks. Keys are stable; only values change.
 */
export const it = {
  app: {
    name: "MAC Recap",
  },
  shell: {
    nav: {
      label: "Navigazione principale",
      newCaseStudy: "Nuovo case study",
      caseStudies: "Case study",
    },
    userMenu: {
      button: "Menu utente",
    },
    noActor:
      "Non è stato possibile identificare il tuo profilo. Ricarica la pagina; se il problema continua, contatta un amministratore.",
  },
  caseStudies: {
    heading: "Case study",
    table: {
      /** Read by screen readers only. */
      caption: "Elenco dei case study",
      columns: {
        id: "ID",
        name: "Nome",
        client: "Cliente",
        year: "Anno",
        status: "Stato",
        updated: "Aggiornato",
        links: "Link",
      },
    },
    search: {
      label: "Cerca nome, cliente o ID",
      placeholder: "Cerca nome, cliente o ID",
    },
    /** `{query}` is filled with the search text. */
    noResults: "Nessun risultato per '{query}'.",
    clearSearch: "Cancella ricerca e filtri",
    empty: "Ancora nessun case study. Inizia dal materiale di un progetto chiuso.",
    narrowScreen: "Questa pagina richiede uno schermo più grande.",
    /** Read by screen readers while the table loads. */
    loading: "Caricamento…",
  },
  /** The new-case-study wizard (Story 2.5): frame, stepper and step 0. */
  wizard: {
    eyebrow: "Nuovo case study",
    /** Accessible name of the top bar's back arrow. */
    back: "Torna ai case study",
    /** Read by screen readers before the case ID in the top bar. */
    caseId: "ID",
    stepper: {
      label: "Passaggi",
      /** Read by screen readers after a completed step. */
      done: "completato",
    },
    steps: {
      material: "Materiale",
      details: "Dettagli",
      generate: "Genera",
    },
    fields: {
      name: "Nome del case study",
      client: "Cliente",
      year: "Anno",
      locale: "Lingua del testo",
    },
    locales: {
      it: "Italiano",
      en: "English",
    },
    errors: {
      name: "Inserisci il nome del case study.",
      client: "Inserisci il cliente.",
      /** `{min}` and `{max}` are filled with the accepted years. */
      year: "Inserisci un anno tra {min} e {max}.",
      locale: "Scegli la lingua del testo.",
      generic: "Non è stato possibile creare il case study. I dati inseriti sono ancora qui: riprova.",
    },
    next: "Avanti",
    /** The wizard's error boundary: the case could not be loaded. */
    loadFailed: "Non è stato possibile aprire il case study. Riprova tra poco.",
    materialPlaceholder: "Il caricamento del materiale non è ancora disponibile in questa versione.",
  },
  /** Case status labels (IR-OP8 interim set), keyed by `CaseStatus`. */
  status: {
    draft: "Bozza",
    generating: "In elaborazione",
    in_review: "Da approvare",
    approved: "Approvato",
  },
  /** Role labels for people, keyed by `Role`; `system` is never shown. */
  role: {
    owner_designer: "Owner/designer",
    account_sales_social: "Account/sales/social",
    admin: "Amministratore",
  },
} as const;

export type Dictionary = typeof it;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every dot-path key that resolves to a string, e.g. `"shell.nav.caseStudies"`. */
export type MessageKey = Leaves<Dictionary>;

/** Typed accessor: `t("shell.nav.caseStudies")`. An unknown key is a type error. */
export function t(key: MessageKey): string {
  let node: unknown = it;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") throw new Error(`Missing dictionary entry: ${key}`);
  return node;
}

/**
 * Inserts `params` into a dictionary template: `fill(t("caseStudies.noResults"), { query })`.
 * Each `{name}` with a matching param is replaced by its value, verbatim; any other
 * `{…}` is left as is. `t()` stays key-only.
 */
export function fill(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

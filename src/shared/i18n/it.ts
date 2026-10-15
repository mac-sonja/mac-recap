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
      /** Read by screen readers before the name of a step that is a link. */
      goTo: "vai a",
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
    /** Step 1, Material (Story 2.7). */
    material: {
      heading: "Aggiungi il materiale del progetto",
      intro: "Carica il materiale già verificato. La generazione parte solo da qui.",
      drop: {
        /** Followed by the lime `browse` link. */
        lead: "Trascina qui i file o",
        browse: "sfoglia",
        /** `{max}` files, `{size}` MB each. */
        hint: "Fino a {max} file, {size} MB ciascuno.",
        /** Accepted-type chips, in display order. */
        types: {
          pdf: "PDF",
          docx: "DOCX",
          text: "TXT / MD",
          image: "PNG / JPG / WEBP",
          video: "MP4 / MOV",
        },
      },
      list: {
        label: "Materiale",
        /** `{n}` live files of `{max}`. */
        count: "{n} / {max} file",
        favourite: "Preferito",
        /** Accessible name of a row's ✕; `{name}` is the file name. */
        remove: "Rimuovi {name}",
        /** Accessible name of a row's progress bar; `{name}` is the file name. */
        progress: "Caricamento di {name}",
      },
      errors: {
        /** `{size}` is the per-file limit in MB. */
        tooLarge: "Oltre {size} MB. Non caricato.",
        type: "Questo tipo di file non è supportato. Usa immagini, video, testi o PDF.",
        /** `{max}` is the per-case file limit. */
        limit: "Limite di {max} file raggiunto. Non caricato.",
        rejected: "Il file caricato non corrisponde a quello scelto. Non caricato.",
        failed: "Caricamento non riuscito.",
        storage:
          "Il caricamento dei file non è disponibile: lo spazio di archiviazione non è configurato. Contatta un amministratore.",
        favourite: "Non è stato possibile salvare il preferito. Riprova.",
        remove: "Non è stato possibile rimuovere il file. Riprova.",
      },
      /** Polite live-region lines; `{name}` is the file name. */
      announce: {
        started: "Caricamento di {name} in corso.",
        done: "{name} caricato.",
        removed: "{name} rimosso.",
        /** `{message}` is the row's error line. */
        error: "{name}: {message}",
      },
      /** Why Avanti is inactive with no file. */
      nextReason: "Aggiungi almeno un file per continuare.",
      favouritesOptional: "I preferiti sono facoltativi.",
    },
    /** Step 2, Details (Story 2.10). */
    details: {
      heading: "Racconta il progetto",
      intro: "Tre campi facoltativi. Servono come fonte, ma da soli non bastano per generare.",
      /** Keyed by the details-form field (`FORM_FIELDS`). */
      labels: {
        context: "Contesto",
        solution: "Soluzione",
        results: "Risultati",
      },
      placeholders: {
        context: "Di cosa aveva bisogno il cliente, e perché?",
        solution: "Cosa avete fatto, e come?",
        results: "Cosa è cambiato? Indica i numeri dove li hai.",
      },
      /** `{n}` filled fields of 3. */
      counter: "{n} di 3 compilati",
      errors: {
        saveFailed: "Non salvato. Riprova modificando il testo.",
        /** `{max}` is the per-field limit in characters. */
        tooLong: "Massimo {max} caratteri.",
      },
      /** Polite live-region line when a save fails; `{field}` is the field label, `{message}` its error. */
      announceError: "{field}: {message}",
    },
    /** Step 3 until Epic 3; also the reason the inactive Avanti gives. */
    generatePlaceholder: "La generazione non è ancora disponibile in questa versione.",
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

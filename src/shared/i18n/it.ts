/**
 * The Italian UI dictionary: every string the tool UI shows comes from here.
 * Plain verbs, no exclamation marks. Keys are stable; only values change.
 */
export const it = {
  app: {
    name: "MAC Recap",
    /** Shown next to the MAC wordmark in the sidebar. */
    wordmarkSuffix: "RECAP",
  },
  shell: {
    nav: {
      label: "Navigazione principale",
      newCaseStudy: "Nuova case history",
      caseStudies: "Case history",
      clients: "Clienti",
    },
    userMenu: {
      button: "Account",
    },
    noActor:
      "Non è stato possibile identificare il tuo profilo. Ricarica la pagina; se il problema continua, contatta un amministratore.",
  },
  caseStudies: {
    heading: "Case history",
    table: {
      /** Read by screen readers only. */
      caption: "Elenco delle case history",
      columns: {
        id: "ID",
        name: "Nome",
        client: "Cliente",
        year: "Anno",
        status: "Stato",
        businessLine: "Business line",
        updated: "Aggiornato",
        links: "Link",
      },
    },
    search: {
      label: "Cerca progetto o cliente",
      placeholder: "Cerca progetto o cliente…",
    },
    /** The status filter (Story 2.17): one segment per status after *Tutti*. */
    filter: {
      label: "Filtra per stato",
      all: "Tutti",
    },
    /** `{query}` is filled with the search text. */
    noResults: "Nessun risultato per '{query}'.",
    /** No row has the filtered status (and no search text); `{status}` is its label. */
    noResultsStatus: "Nessuna case history in stato {status}.",
    /** The search and a status filter leave no rows; `{query}` is the search text, `{status}` the status label. */
    noResultsQueryStatus: "Nessun risultato per “{query}” tra {status}.",
    clearSearch: "Cancella ricerca e filtri",
    empty: "Ancora nessuna case history. Inizia dal materiale di un progetto chiuso.",
    narrowScreen: "Questa pagina richiede uno schermo più grande.",
    /** Read by screen readers while the table loads. */
    loading: "Caricamento…",
  },
  /** The fixed business lines (Story 2.17), keyed by `BusinessLine`, in display order. */
  businessLines: {
    branding: "Branding",
    social_media: "Social media",
    video: "Video",
    web_design: "Web design",
    advertising: "Advertising",
    eventi: "Eventi",
  },
  /** The new-case-study wizard (Story 2.5): frame, stepper and step 1 Dettagli (Story 2.17). */
  wizard: {
    eyebrow: "Nuova case history",
    /** Accessible name of the top bar's back arrow. */
    back: "Torna alle case history",
    /** Read by screen readers before the case history code in the top bar. */
    caseId: "ID",
    stepper: {
      label: "Passaggi",
      /** Read by screen readers after a completed step. */
      done: "completato",
      /** Read by screen readers before the name of a step that is a link. */
      goTo: "vai a",
    },
    /** In stepper order: 1 Dettagli, 2 Materiale, 3 Genera (Story 2.17). */
    steps: {
      details: "Dettagli",
      material: "Materiale",
      generate: "Genera",
    },
    fields: {
      name: "Nome della case history",
      client: "Cliente",
      year: "Anno",
      businessLine: "Business line",
    },
    /** After a required field's label (Anno); hidden from screen readers, which read `aria-required`. */
    requiredMark: "*",
    /** The browser tab while the case wizard's Dettagli step is open; `{title}` is the live title. */
    tabTitle: "{title} · {app}",
    /** Under the client of an existing case: it is fixed once the case exists. */
    clientFixed: "Il cliente non cambia dopo la creazione: il codice dipende da lui.",
    /** Asked before leaving step 1 with entries that can't be kept (a new case, or required fields missing). */
    unsavedConfirm: "Le informazioni inserite non sono ancora salvate. Uscire comunque?",
    /** Why Avanti is inactive on step 1; `{fields}` names the missing ones. */
    nextReason: "Per continuare compila: {fields}.",
    /** Joins the `{fields}` of `nextReason`. */
    listSeparator: ", ",
    /** The step 1 client search's placeholder, shown until something is typed or a client is picked. */
    clientPlaceholder: "Scegli un cliente",
    /** A step 1 client option (and the search's text once picked): `{name}` and its `{code}`. */
    clientOption: "{name} ({code})",
    /** Step 1 with no clients: replaces the client field; Avanti stays inactive. `{link}` is `noClientsLink`, a link to /clients. */
    noClients: "Nessun cliente. Aggiungilo nella {link}.",
    /** Announced to screen readers after typing in the client search pauses: the number of matches. */
    clientCount: "{n} clienti",
    clientCountOne: "1 cliente",
    clientCountNone: "Nessun cliente trovato",
    /** Above step 1's fields: what the marker after a label means. */
    requiredLegend: "* obbligatorio",
    /** Accessible name of the client search's list of options. */
    clientList: "Clienti",
    /** Under the client search when the typed text matches no client. `{link}` is `noClientsLink`. */
    noClientMatch: "Nessun cliente trovato. Aggiungilo nella {link}.",
    noClientsLink: "pagina Clienti",
    errors: {
      name: "Inserisci il nome della case history.",
      client: "Scegli il cliente.",
      /** `CLIENT_NOT_FOUND`: the picked client is no longer in the list the page loaded. */
      clientNotFound: "Questo cliente non è più disponibile. Ricarica la pagina e scegli di nuovo.",
      /** `{min}` and `{max}` are filled with the accepted years. */
      year: "Inserisci un anno tra {min} e {max}.",
      businessLine: "Scegli la business line.",
      generic: "Non è stato possibile creare la case history. I dati inseriti sono ancora qui: riprova.",
      /** An existing case's details could not be saved. */
      saveFailed: "Non è stato possibile salvare i dettagli. I dati inseriti sono ancora qui: riprova.",
      /** `NOT_FOUND` or `STALE_STATUS`: the case was deleted or is no longer a draft. */
      notDraft: "Questa case history non è più una bozza. Torna alle case history.",
    },
    next: "Avanti",
    /** The wizard's error boundary: the case could not be loaded. */
    loadFailed: "Non è stato possibile aprire la case history. Riprova tra poco.",
    /** Step 1, Material (Story 2.7). */
    material: {
      heading: "Aggiungi il materiale del progetto",
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
    },
    /** Step 2, Details (Story 2.10). */
    details: {
      heading: "Racconta il progetto",
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
  /** The Clients page and a client's page (Story 2.13). Owner/designer only. */
  clients: {
    heading: "Clienti",
    table: {
      /** Read by screen readers only. */
      caption: "Elenco dei clienti",
      columns: {
        code: "ID",
        name: "Nome",
        caseCount: "Case history",
      },
    },
    search: {
      label: "Cerca nome o codice",
      placeholder: "Cerca nome o codice",
    },
    /** `{query}` is filled with the search text. */
    noResults: "Nessun cliente per '{query}'.",
    clearSearch: "Cancella ricerca",
    empty: "Nessun cliente. Aggiungi il primo.",
    /** The empty state where clients can't be added: below 1024 px, or without `manage clients`. */
    emptyReadOnly: "Nessun cliente.",
    /** Read by screen readers while the table loads. */
    loading: "Caricamento…",
    add: "Aggiungi cliente",
    edit: "Modifica cliente",
    /** Industry pill labels, keyed by `CLIENT_INDUSTRIES` (the fixed list, SCP 2026-10-19). */
    industries: {
      interior_design: "Interior design",
      energia: "Energia",
      risorse_umane: "Risorse umane",
      lusso: "Lusso",
    },
    errors: {
      nameRequired: "Inserisci il nome del cliente.",
      /** `{max}` is the field limit in characters. */
      nameTooLong: "Massimo {max} caratteri.",
      /** `{max}` is the field limit in characters (description, brief texts). */
      fieldTooLong: "Massimo {max} caratteri.",
      nameTaken: "Esiste già un cliente con questo nome.",
      codeExhausted: "Non è stato possibile assegnare un codice a questo nome. Usa un nome diverso.",
      logoType: "Formato non supportato. Usa un file PNG, JPEG, WebP o SVG.",
      /** `{size}` is the logo limit in MB. */
      logoTooLarge: "Il logo supera {size} MB.",
      logoEmpty: "Il file è vuoto.",
      /** `{px}` is the minimum short side in pixels. */
      logoTooSmall: "Il logo deve misurare almeno {px} px sul lato corto.",
      logoUnsafe: "Il file SVG non è sicuro: contiene script o collegamenti esterni.",
      logoUnreadable: "Non è stato possibile leggere l'immagine. Scegli un altro file.",
      logoFailed: "Non è stato possibile caricare il logo. Gli altri dati sono salvati: premi Avanti per riprovare.",
      generic: "Non è stato possibile salvare. Riprova.",
    },
    /** A client's page. */
    detail: {
      /** Read by screen readers before the client code. */
      code: "Codice",
      /** The industries' pill list name. */
      industries: "Settore",
      /** The logo's alt text; `{name}` is the client name. */
      logoAlt: "Logo {name}",
      casesHeading: "Case history",
      noCases: "Nessuna case history per questo cliente.",
      back: "Tutti i clienti",
    },
  },
  /** The client wizard (Story 2.15): frame, stepper, step 1 Dettagli and the step 2 placeholder. */
  clientWizard: {
    eyebrow: "Nuovo cliente",
    /** The eyebrow on an existing client. */
    editEyebrow: "Modifica cliente",
    /** Accessible names of the top bar's back arrow: adding, and editing a client. */
    backToClients: "Torna ai clienti",
    backToClient: "Torna al cliente",
    /** Read by screen readers before the client code in the top bar. */
    code: "Codice",
    /** Step 3 stays hidden until it is designed with the owner (Story 4.11). */
    steps: {
      details: "Dettagli",
      material: "Materiale",
      intro: "Introduzione",
    },
    /** Step 1 on an existing client; `{code}` is the client code, which never changes. */
    editNote: "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history.",
    details: {
      heading: "I dati del cliente",
      labels: {
        name: "Nome",
        industries: "Settore",
        description: "Descrizione",
        logo: "Logo",
        context: "Contesto",
        solution: "Soluzione",
        results: "Risultati",
      },
      /** One-line prompts in the brief textareas, as in the case Details step. */
      placeholders: {
        context: "Chi è il cliente, e in che situazione si trovava?",
        solution: "Cosa avete fatto per il cliente, e come?",
        results: "Cosa è cambiato per il cliente? Indica i numeri dove li hai.",
      },
      industriesHint: "Scegli uno o più settori.",
      /** The description's live counter: `{n}` characters of `{max}`. */
      counter: "{n}/{max}",
      /** `{size}` MB and `{px}` pixels on the short side (PNG, JPEG and WebP only). */
      logoHint: "PNG, JPEG, WebP o SVG, fino a {size} MB. PNG, JPEG e WebP almeno {px} px sul lato corto.",
      logoChoose: "Scegli il logo",
      logoReplace: "Sostituisci il logo",
      /** The logo preview's alt text; `{name}` is the client name. */
      logoAlt: "Logo {name}",
      /** Why Avanti is inactive; `{fields}` lists the empty fields' labels. */
      nextReason: "Per continuare compila: {fields}.",
      /** Joins the `{fields}` of `nextReason`. */
      listSeparator: ", ",
      errors: {
        /** A field the server found empty or outside the list. */
        required: "Compila questo campo.",
        /** A brief text that could not be saved (also the autosave error). */
        saveFailed: "Non salvato. Riprova modificando il testo.",
      },
      /** Polite live-region line when a save fails; `{field}` is the field label, `{message}` its error. */
      announceError: "{field}: {message}",
    },
    /** Elimina cliente on step 1 of an existing client (owner, 2026-10-19). */
    delete: {
      button: "Elimina cliente",
      /** `{name}` is the client name. */
      title: "Eliminare {name}?",
      /** `{n}` is the client's non-deleted case history count (1 or more). */
      withCases: "Verranno eliminate anche le sue {n} case history, comprese quelle approvate. L'operazione non si può annullare.",
      /** With no case histories. */
      noCases: "Il cliente non ha case history. L'operazione non si può annullare.",
      confirmLabel: "Scrivi il nome del cliente per confermare",
      cancel: "Annulla",
      confirm: "Elimina",
      /** Why Elimina is inactive. */
      confirmReason: "Scrivi il nome del cliente per attivare Elimina.",
      /** The name changed elsewhere since the page loaded (CLIENT_DELETE_NAME_MISMATCH). */
      nameChanged: "Il nome del cliente è cambiato. Ricarica la pagina e riprova.",
      /** Any other failure, a dropped connection included. */
      failed: "Non è stato possibile eliminare il cliente. Riprova.",
    },
    /** Step 2 Materiale (Story 2.16): 2–3 files for the intro pages. */
    material: {
      heading: "Materiale",
      /** Above the drop zone. */
      intro: "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione.",
      createIntro: "Crea introduzione",
      /** Why Crea introduzione is inactive with fewer than 2 images. */
      createIntroReason: "Carica almeno 2 immagini.",
      errors: {
        /** A 4th file. */
        limit: "Massimo 3 file.",
        /** An image under `{min}` px on the short side or over `{max}` px on a side. */
        pixels: "Immagine troppo piccola o troppo grande: serve almeno {min} px sul lato corto e al massimo {max} px per lato.",
      },
    },
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

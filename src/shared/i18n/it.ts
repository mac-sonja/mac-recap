/**
 * The Italian UI dictionary: every string the tool UI shows comes from here.
 * Friendly agency voice: plain verbs, short calls to action, no exclamation marks. Keys are stable; only values change.
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
      home: "Home",
      caseStudies: "Case history",
      clients: "Clienti",
      /** After Case in the sidebar: `{n}` cases waiting for a review. */
      toReview: "{n} da approvare",
    },
    userMenu: {
      button: "Il tuo profilo",
    },
    /** The appearance switch at the bottom of the sidebar. */
    theme: {
      label: "Aspetto",
      system: "Automatico",
      light: "Chiaro",
      dark: "Scuro",
    },
    noActor:
      "Non riusciamo a riconoscere il tuo profilo. Prova a ricaricare la pagina: se non basta, scrivi a un amministratore.",
  },
  /** The Home dashboard. `{name}` is the person's first name. */
  home: {
    greeting: "Ciao, {name}",
    lead: "Ecco a che punto sono i racconti dei vostri progetti.",
    stats: {
      label: "In sintesi",
      total: "Case history in archivio",
      toReview: "Da approvare",
      drafts: "Bozze aperte",
      approved: "Pronte da condividere",
      clients: "Clienti",
    },
    review: {
      heading: "Ti aspettano",
      empty: "Niente da approvare. Goditi il momento.",
    },
    drafts: {
      heading: "Da riprendere",
      empty: "Nessuna bozza in sospeso.",
    },
    recent: {
      heading: "Movimenti recenti",
      empty: "Ancora nessuna case history. La prima è a un clic.",
    },
    seeAll: "Vedi tutte",
    start: {
      heading: "Hai chiuso un progetto?",
      body: "Carica il materiale e scrivi due righe: al racconto pensiamo insieme.",
      action: "Inizia ora",
    },
  },
  caseStudies: {
    heading: "Case history",
    lead: "Tutti i progetti che vale la pena raccontare, dalla prima bozza alla versione approvata.",
    table: {
      /** Read by screen readers only. */
      caption: "Elenco delle case history",
      columns: {
        id: "ID",
        name: "Case history",
        client: "Cliente",
        year: "Anno",
        status: "Stato",
        businessLine: "Business line",
        updated: "Aggiornata",
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
      /** Segment labels, plural, keyed by `CaseStatus`. */
      statuses: {
        draft: "Bozza",
        generating: "In elaborazione",
        in_review: "Da approvare",
        approved: "Approvato",
      },
    },
    /** `{query}` is filled with the search text. */
    noResults: "Nessuna case history per “{query}”.",
    /** No row has the filtered status (and no search text); `{status}` is its label. */
    noResultsStatus: "Nessuna case history in “{status}”.",
    /** The search and a status filter leave no rows; `{query}` is the search text, `{status}` the status label. */
    noResultsQueryStatus: "Nessuna case history per “{query}” in “{status}”.",
    clearSearch: "Azzera i filtri",
    empty: "Qui raccoglierai le storie dei vostri progetti. Parti dal materiale di un lavoro appena chiuso.",
    emptyAction: "Crea la prima",
    /** The Case history page's toolbar action (the sidebar already says *Nuova case history*). */
    add: "Crea case history",
    narrowScreen: "Questa pagina dà il meglio su uno schermo più grande.",
    /** Read by screen readers while the table loads. */
    loading: "Un attimo…",
  },
  /** The fixed business lines (Story 2.17), keyed by `BusinessLine`, in display order. */
  businessLines: {
    branding: "Branding",
    social_media: "Social media",
    video: "Video",
    web_design: "Web design",
    advertising: "Advertising",
    eventi: "Eventi",
    sviluppo: "Sviluppo",
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
      name: "Titolo della case history",
      client: "Cliente",
      year: "Anno",
      businessLine: "Business line",
    },
    /** After a required field's label (case and client wizard step 1, no legend); hidden from screen readers, which read `aria-required`. */
    requiredMark: "*",
    /** The browser tab while the case wizard's Dettagli step is open; `{title}` is the live title. */
    tabTitle: "{title} · {app}",
    /** Under the client of an existing case: it is fixed once the case exists. */
    clientFixed: "Il cliente resta questo: il codice della case history nasce da lui.",
    /** Asked before leaving step 1 with entries that can't be kept (a new case, or required fields missing). */
    unsavedConfirm: "Quello che hai scritto non è ancora salvato. Vuoi uscire lo stesso?",
    /** Why Avanti is inactive on step 1; `{fields}` names the missing ones. */
    nextReason: "Per andare avanti manca: {fields}.",
    /** Joins the `{fields}` of `nextReason`. */
    listSeparator: ", ",
    /** The step 1 client search's placeholder, shown until something is typed or a client is picked. */
    clientPlaceholder: "Cerca o scegli un cliente",
    /** A step 1 client option (and the search's text once picked): `{name}` and its `{code}`. */
    clientOption: "{name} ({code})",
    /** Step 1 with no clients: replaces the client field; Avanti stays inactive. `{link}` is `noClientsLink`, a link to /clients. */
    noClients: "Non c’è ancora nessun cliente. Aggiungilo dalla {link}.",
    /** Announced to screen readers after typing in the client search pauses: the number of matches. */
    clientCount: "{n} clienti",
    clientCountOne: "1 cliente",
    clientCountNone: "Nessun cliente trovato",
    /** Accessible name of the client search's list of options. */
    clientList: "Clienti",
    /** Under the client search when the typed text matches no client. `{link}` is `noClientsLink`. */
    noClientMatch: "Nessun cliente con questo nome. Aggiungilo dalla {link}.",
    noClientsLink: "pagina Clienti",
    errors: {
      name: "Dai un titolo alla case history.",
      client: "Scegli per quale cliente è.",
      /** `CLIENT_NOT_FOUND`: the picked client is no longer in the list the page loaded. */
      clientNotFound: "Questo cliente non c’è più. Ricarica la pagina e sceglilo di nuovo.",
      /** `{min}` and `{max}` are filled with the accepted years. */
      year: "Scrivi un anno tra il {min} e il {max}.",
      businessLine: "Scegli la business line.",
      generic: "Non siamo riusciti a creare la case history. Quello che hai scritto è ancora qui: riprova.",
      /** An existing case's details could not be saved. */
      saveFailed: "Non siamo riusciti a salvare. Quello che hai scritto è ancora qui: riprova.",
      /** `NOT_FOUND` or `STALE_STATUS`: the case was deleted or is no longer a draft. */
      notDraft: "Questa case history non è più una bozza. Torna all’elenco per vederla.",
    },
    next: "Avanti",
    /** The wizard's error boundary: the case could not be loaded. */
    loadFailed: "Non riusciamo ad aprire questa case history. Riprova tra qualche istante.",
    /** Step 1, Material (Story 2.7). */
    material: {
      heading: "Porta qui il materiale del progetto",
      drop: {
        /** Followed by the lime `browse` link. */
        lead: "Trascina qui i file oppure",
        browse: "sceglili dal computer",
        /** `{max}` files, `{size}` MB each. */
        hint: "Fino a {max} file, massimo {size} MB l’uno.",
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
        tooLarge: "Supera i {size} MB, non l’abbiamo caricato.",
        type: "Questo formato non lo leggiamo. Usa immagini, video, testi o PDF.",
        /** `{max}` is the per-case file limit. */
        limit: "Hai raggiunto i {max} file. Questo non è stato caricato.",
        rejected: "Il file arrivato non è quello scelto, quindi non l’abbiamo caricato.",
        failed: "Caricamento non riuscito.",
        storage:
          "Il caricamento dei file non è ancora attivo: manca lo spazio di archiviazione. Scrivi a un amministratore.",
        favourite: "Non siamo riusciti a segnare il preferito. Riprova.",
        remove: "Non siamo riusciti a rimuovere il file. Riprova.",
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
      nextReason: "Aggiungi almeno un file per andare avanti.",
    },
    /** Step 2, Details (Story 2.10). */
    details: {
      heading: "Raccontaci il progetto",
      /** Keyed by the details-form field (`FORM_FIELDS`). */
      labels: {
        context: "Contesto",
        solution: "Soluzione",
        results: "Risultati",
      },
      placeholders: {
        context: "Da dove siete partiti? Cosa serviva al cliente, e perché?",
        solution: "Cosa avete fatto, e con quale idea?",
        results: "Cosa è cambiato dopo? I numeri, se li hai, fanno la differenza.",
      },
      /** `{n}` filled fields of 3. */
      counter: "{n} di 3 compilati",
      errors: {
        saveFailed: "Non salvato. Modifica il testo per riprovare.",
        /** `{max}` is the per-field limit in characters. */
        tooLong: "Al massimo {max} caratteri.",
      },
      /** Polite live-region line when a save fails; `{field}` is the field label, `{message}` its error. */
      announceError: "{field}: {message}",
    },
    /** Step 3 until Epic 3; also the reason the inactive Avanti gives. */
    generatePlaceholder: "La generazione arriva nella prossima versione. Ci stiamo lavorando.",
  },
  /** The Clients page and a client's page (Story 2.13). Owner/designer only. */
  clients: {
    heading: "Clienti",
    lead: "Le aziende con cui abbiamo lavorato. Apri un cliente per vedere il suo profilo e le sue case history.",
    table: {
      /** Read by screen readers only. */
      caption: "Elenco dei clienti",
      columns: {
        code: "ID",
        name: "Cliente",
        caseCount: "Case history",
      },
    },
    /** A client card's case count. */
    caseCount: "{n} case history",
    caseCountOne: "1 case history",
    /** A client card's profile state: every required field filled, or not yet. */
    complete: "Profilo completo",
    incomplete: "Profilo da completare",
    /** The sort menu of the client cards. */
    sort: {
      label: "Ordina per",
      nameAsc: "Nome, A–Z",
      nameDesc: "Nome, Z–A",
      mostCases: "Più case history",
      code: "Codice",
    },
    search: {
      label: "Cerca per nome o codice",
      placeholder: "Nome o codice",
    },
    /** `{query}` is filled with the search text. */
    noResults: "Nessun cliente per “{query}”.",
    clearSearch: "Azzera la ricerca",
    empty: "Ancora nessun cliente. Aggiungi il primo e partiamo.",
    /** The empty state where clients can't be added: below 1024 px, or without `manage clients`. */
    emptyReadOnly: "Ancora nessun cliente.",
    /** Read by screen readers while the table loads. */
    loading: "Un attimo…",
    add: "Aggiungi cliente",
    edit: "Modifica",
    /** Industry pill labels, keyed by `CLIENT_INDUSTRIES` (the fixed list, SCP 2026-10-19). */
    industries: {
      interior_design: "Interior design",
      energia: "Energia",
      risorse_umane: "Risorse umane",
      lusso: "Lusso",
    },
    errors: {
      nameRequired: "Scrivi il nome del cliente.",
      /** `{max}` is the field limit in characters. */
      nameTooLong: "Al massimo {max} caratteri.",
      /** `{max}` is the field limit in characters (description, brief texts). */
      fieldTooLong: "Al massimo {max} caratteri.",
      nameTaken: "C’è già un cliente con questo nome.",
      codeExhausted: "Non riusciamo a creare un codice per questo nome. Prova con un nome diverso.",
      logoType: "Questo formato non va. Usa PNG, JPEG, WebP o SVG.",
      /** `{size}` is the logo limit in MB. */
      logoTooLarge: "Il logo supera i {size} MB.",
      logoEmpty: "Il file è vuoto.",
      /** `{px}` is the minimum short side in pixels. */
      logoTooSmall: "Il logo è troppo piccolo: serve almeno {px} px sul lato corto.",
      logoUnsafe: "Questo SVG contiene script o collegamenti esterni, quindi non possiamo usarlo.",
      logoUnreadable: "Non riusciamo a leggere l’immagine. Prova con un altro file.",
      logoFailed: "Il logo non è stato caricato, il resto è salvato. Premi Avanti per riprovare.",
      generic: "Non siamo riusciti a salvare. Riprova.",
    },
    /** A client's page. */
    detail: {
      /** Read by screen readers before the client code. */
      code: "Codice",
      /** The industries' pill list name. */
      industries: "Settore",
      /** The logo's alt text; `{name}` is the client name. */
      logoAlt: "Logo {name}",
      casesHeading: "Le sue case history",
      noCases: "Nessuna case history per questo cliente, per ora.",
      /** The client page's own call to action (the sidebar already says *Nuova case history*). */
      newCase: "Crea nuova case history",
      back: "Clienti",
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
    editNote: "Il codice {code} resta lo stesso. Quello che cambi qui si aggiorna in tutte le sue case history.",
    details: {
      heading: "Presentaci il cliente",
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
        context: "Chi è il cliente e da che situazione partiva?",
        solution: "Come lo avete aiutato, e con quale idea?",
        results: "Cosa è cambiato per lui? I numeri, se li hai, fanno la differenza.",
      },
      industriesHint: "Puoi sceglierne più di uno.",
      /** The description's live counter: `{n}` characters of `{max}`. */
      counter: "{n}/{max}",
      /** `{size}` MB and `{px}` pixels on the short side (PNG, JPEG and WebP only). */
      logoHint: "PNG, JPEG, WebP o SVG fino a {size} MB. Per PNG, JPEG e WebP almeno {px} px sul lato corto.",
      logoChoose: "Carica il logo",
      logoReplace: "Cambia logo",
      /** The logo preview's alt text; `{name}` is the client name. */
      logoAlt: "Logo {name}",
      /** Why Avanti is inactive; `{fields}` lists the empty fields' labels. */
      nextReason: "Per andare avanti manca: {fields}.",
      /** Joins the `{fields}` of `nextReason`. */
      listSeparator: ", ",
      errors: {
        /** A field the server found empty or outside the list. */
        required: "Questo campo serve.",
        /** A brief text that could not be saved (also the autosave error). */
        saveFailed: "Non salvato. Modifica il testo per riprovare.",
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
      withCases: "Con lui spariscono anche le sue {n} case history, approvate comprese. Non si torna indietro.",
      /** With no case histories. */
      noCases: "Il cliente non ha case history. Una volta eliminato non si torna indietro.",
      confirmLabel: "Per conferma, scrivi il nome del cliente",
      cancel: "Annulla",
      confirm: "Elimina",
      /** Why Elimina is inactive. */
      confirmReason: "Scrivi il nome del cliente per attivare Elimina.",
      /** The name changed elsewhere since the page loaded (CLIENT_DELETE_NAME_MISMATCH). */
      nameChanged: "Nel frattempo il nome del cliente è cambiato. Ricarica la pagina e riprova.",
      /** Any other failure, a dropped connection included. */
      failed: "Non siamo riusciti a eliminare il cliente. Riprova.",
    },
    /** Step 2 Materiale (Story 2.16): 2–3 files for the intro pages. */
    material: {
      heading: "Materiale",
      /** Above the drop zone. */
      intro: "Carica fino a 3 file, di cui almeno 2 immagini: ci servono per le pagine di presentazione.",
      createIntro: "Crea la presentazione",
      /** Why Crea introduzione is inactive with fewer than 2 images. */
      createIntroReason: "Servono almeno 2 immagini.",
      errors: {
        /** A 4th file. */
        limit: "Al massimo 3 file.",
        /** An image under `{min}` px on the short side or over `{max}` px on a side. */
        pixels: "Le misure non vanno: serve almeno {min} px sul lato corto e al massimo {max} px per lato.",
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

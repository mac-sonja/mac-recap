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
      home: "Dashboard",
      caseStudies: "Case history",
      clients: "Clienti",
      /** Account/sales/social: the library of approved cases (Story 5.1). */
      library: "Libreria",
      /** Admin: the Organizzazione screen (Story 6.3), right after Clienti. */
      organization: "Organizzazione",
      /** Above Nuova case history: searches the case list and opens it filtered. */
      search: {
        label: "Cerca progetto o cliente",
        placeholder: "Cerca…",
      },
      /** After Case in the sidebar: `{n}` cases waiting for a review. */
      toReview: "{n} da approvare",
    },
    userMenu: {
      button: "Il tuo profilo",
      signOut: "Esci",
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
  /** The Dashboard (route `/home`). `{name}` is the person's first name. */
  home: {
    greeting: "Ciao, {name}",
    lead: "Ecco a che punto sono i racconti dei vostri progetti.",
    stats: {
      label: "In sintesi",
      toReview: "Da approvare",
      generating: "In elaborazione",
      drafts: "Bozze aperte",
    },
    review: {
      heading: "Da approvare",
      empty: "Niente da approvare. Goditi il momento.",
      /** Opens the Case table filtered to Da approvare, oldest first. */
      seeAll: "Tutte da approvare",
    },
    drafts: {
      heading: "A metà strada",
      empty: "Nessuna bozza in sospeso.",
    },
    /** One line per case, its latest change; `{name}` is the case name, shown in bold. */
    /**
     * One line per change, newest first (owner, 2026-10-21): `{actor}` is who did it,
     * `{name}` the case (in bold); `{n}` counts changes of one kind made in a row.
     */
    activity: {
      heading: "Attività",
      empty: "Ancora nessuna case history. La prima è a un clic.",
      failed: "Non siamo riusciti a caricare le attività. Ricarica la pagina per riprovare.",
      created: "{actor} ha creato {name}.",
      detailsUpdated: "{actor} ha aggiornato i dettagli di {name}.",
      storyWritten: "{actor} ha scritto il racconto di {name}.",
      uploadedOne: "{actor} ha caricato un file in {name}.",
      uploaded: "{actor} ha caricato {n} file in {name}.",
      removedOne: "{actor} ha tolto un file da {name}.",
      removed: "{actor} ha tolto {n} file da {name}.",
      generate: "{actor} ha avviato la bozza di {name}.",
      generated: "La bozza di {name} è pronta da rivedere.",
      generationFailed: "Non siamo riusciti a scrivere la bozza di {name}.",
      approved: "{actor} ha approvato {name}.",
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
        businessLine: "Servizi",
        updated: "Aggiornata",
        links: "Link",
        /** Read by screen readers only: the column of Scarica and Modifica. */
        actions: "Azioni",
      },
      /** The Link column's icon, read by screen readers; `{name}` is the case name. */
      openLink: "Apri il link di {name} in un’altra scheda",
      /** An Approvato row's link to the configurator (Story 5.2, with `edit`). */
      edit: "Modifica",
      /** Its accessible name; `{name}` is the case name. */
      editLabel: "Modifica {name}",
      /** Said politely when a click lands on an In elaborazione row, which has nowhere to go. */
      stillGenerating: "Ancora in elaborazione",
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
    /**
     * Deleting a case: a draft from its row or the opened draft (Story 4.1, owner
     * 2026-10-22), an approved case from its page (Story 5.2, owner 2026-10-28). The person
     * types *elimina* first.
     */
    delete: {
      /** The row's bin icon, read by screen readers and shown on hover; `{name}` is the case name. */
      button: "Elimina {name}",
      /** The button bottom left in an opened draft, opposite Avanti. */
      barButton: "Elimina bozza",
      /** The button bottom left of an approved case's page (Owner and Amministratore). */
      approvedButton: "Elimina",
      /** `{name}` is the case name (the Case list row). */
      title: "Eliminare {name}?",
      /** In an opened draft, whose name may be mid-edit. */
      titleOpen: "Eliminare questa bozza?",
      description: "La bozza sparisce da ogni elenco, insieme al materiale caricato. Non si torna indietro.",
      approvedDescription: "La case history approvata sparisce da ogni elenco, insieme al materiale caricato. Non si torna indietro.",
      /** The word to type, compared trimmed and case-insensitive. */
      word: "elimina",
      confirmLabel: "Per conferma, scrivi “elimina”",
      /** Why Elimina is inactive. */
      confirmReason: "Scrivi “elimina” per attivare il pulsante.",
      cancel: "Annulla",
      confirm: "Elimina",
      /** The case left Bozza since the page loaded (CASE_NOT_DELETABLE). */
      notDraft: "Nel frattempo non è più una bozza, quindi non si può eliminare.",
      /** An approved case changed status since the page loaded (CASE_NOT_DELETABLE). */
      statusChanged: "Nel frattempo il suo stato è cambiato, quindi non si può eliminare.",
      failed: "Non siamo riusciti a eliminarla. Riprova tra poco.",
    },
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
    /** In stepper order: Materiale, Dettagli, Genera (material first, owner 2026-10-21). */
    steps: {
      details: "Dettagli",
      material: "Materiale",
      generate: "Genera",
    },
    /** A new case's title until Dettagli gives it one: the new-case dialog asks for the client only. */
    untitled: "Nome progetto",
    fields: {
      name: "Titolo della case history",
      client: "Cliente",
      year: "Anno",
      businessLine: "Servizi",
    },
    /** After a required field's label (case and client wizard step 1, no legend); hidden from screen readers, which read `aria-required`. */
    requiredMark: "*",
    /** The browser tab while the case wizard's Dettagli step is open; `{title}` is the live title. */
    tabTitle: "{title} · {app}",
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
      businessLine: "Scegli un servizio.",
      generic: "Non siamo riusciti a creare la case history. Quello che hai scritto è ancora qui: riprova.",
      /** An existing case's details could not be saved. */
      saveFailed: "Non siamo riusciti a salvare. Quello che hai scritto è ancora qui: riprova.",
      /** `NOT_FOUND` or `STALE_STATUS`: the case was deleted or is no longer a draft. */
      notDraft: "Questa case history non è più una bozza. Torna all’elenco per vederla.",
    },
    next: "Avanti",
    cancel: "Annulla",
    /** The wizard's error boundary: the case could not be loaded. */
    loadFailed: "Non riusciamo ad aprire questa case history. Riprova tra qualche istante.",
    /** Step 1, Material (Story 2.7). */
    material: {
      heading: "Porta qui il materiale del progetto",
      /** Under the heading, as on Racconto. */
      intro: "Foto, video, presentazioni, appunti: tutto quello che hai sul progetto. L’AI parte da qui, insieme a quello che scriverai dopo.",
      drop: {
        /** Followed by the lime `browse` link. */
        lead: "Trascina qui i file o",
        browse: "sfoglia",
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
      },
      placeholders: {
        context: "Da dove siete partiti? Cosa serviva al cliente, e perché?",
        solution: "Cosa avete fatto, e con quale idea?",
      },
      /** `{n}` filled fields of `{total}`. */
      counter: "{n} di {total} compilati",
      errors: {
        saveFailed: "Non salvato. Modifica il testo per riprovare.",
        /** `{max}` is the per-field limit in characters. */
        tooLong: "Al massimo {max} caratteri.",
      },
      /** Polite live-region line when a save fails; `{field}` is the field label, `{message}` its error. */
      announceError: "{field}: {message}",
    },
    /** Step 3, Genera (Story 3.7b): the material summary, the action, the waiting screen and a failed run. */
    generate: {
      /** `{n}` files, `{m}` of `{total}` details (Contesto and Soluzione, like step 2's counter). */
      counter: "{n} file, {m} di {total} dettagli compilati",
      action: "Genera",
      retry: "Riprova",
      /** Why Genera is inactive with no file. */
      noMaterial: "Aggiungi almeno un file per poter generare.",
      /** Polite status line while the request is sent. */
      starting: "Stiamo avviando la generazione.",
      errors: {
        /** Any other failure: nothing was started. */
        generic: "Non siamo riusciti ad avviare la generazione. Riprova tra qualche istante.",
      },
      /** The last generation did not finish; material and details are untouched. */
      failed: "L’ultima generazione non è andata a buon fine. Il materiale e i dettagli sono al sicuro: riprova.",
      /** The screen shown while the case is In elaborazione. */
      waiting: {
        heading: "Stiamo scrivendo la case history",
        body: "Ci vuole un po’. Puoi restare qui o tornare all’elenco: la ritrovi in “Da approvare” appena è pronta.",
      },
    },
  },
  /**
   * Risultati and Testimonial, each in its own card: in the client panel and in the case
   * Details step (owner, 2026-10-22; Story 2.21). Same fields, limits and messages.
   */
  story: {
    /** Risultati in its own card (owner, 2026-10-22): up to 3 rows of label + value, optional. */
    results: {
      title: "Risultati",
      hint: "Fino a 3 numeri. Facoltativo.",
      /** A row's accessible names; `{n}` is the row (1–3). */
      labelName: "Risultato {n}, cosa misuri",
      valueName: "Risultato {n}, numero",
      /** Placeholders by row, as in the mock. */
      placeholders: [
        { label: "Candidature ricevute", value: "+180%" },
        { label: "Visualizzazioni video", value: "2,4M" },
        { label: "Follower su LinkedIn", value: "+35%" },
      ],
      /** Under a row with only one of its two parts: it is not saved. */
      halfRow: "Scrivi sia cosa misuri sia il numero.",
    },
    /** The client's quote in its own card (owner, 2026-10-22), optional. */
    testimonial: {
      title: "Testimonial",
      hint: "Facoltativo.",
      quoteName: "Frase del cliente",
      authorName: "Autore della frase",
      quotePlaceholder: "Una frase del cliente, tra virgolette nel suo stile",
      authorPlaceholder: "Nome Cognome, ruolo",
      /** An author without a quote: it is not saved. */
      missingQuote: "Manca la frase.",
    },
    errors: {
      /** A Risultati or Testimonial save that failed (the autosave error). */
      saveFailed: "Non salvato. Modifica il testo per riprovare.",
      /** `{max}` is the part's limit in characters. */
      tooLong: "Al massimo {max} caratteri.",
    },
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
      logoFailed: "Il logo non è stato caricato, il resto è salvato. Premi Salva per riprovare.",
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
  /**
   * The client side panel (owner's mock, 2026-10-21): add and edit a client in one
   * sectioned form, over the Clienti list or the client's page.
   */
  clientPanel: {
    addTitle: "Nuovo cliente",
    editTitle: "Modifica cliente",
    /** Under the title of a new client. */
    addNote: "Il codice si genera da solo e non cambia mai.",
    /** Under the title of an existing client; `{code}` is the client code, which never changes. */
    editNote: "Il codice {code} resta lo stesso. Quello che cambi qui si aggiorna in tutte le sue case history.",
    /** The ×'s accessible name. */
    close: "Chiudi",
    cancel: "Annulla",
    /** The primary action on a new client. */
    add: "Aggiungi",
    /** The primary action on an existing client. */
    save: "Salva",
    sections: {
      details: "Dettagli",
      media: "Logo e immagini",
    },
    details: {
      labels: {
        name: "Nome",
        industries: "Settore",
        description: "Descrizione",
        logo: "Logo",
        images: "Immagini",
        context: "Contesto",
        solution: "Soluzione",
      },
      namePlaceholder: "Ragione sociale o nome del brand",
      descriptionHint: "Da qui l’AI scrive la bozza dell’intro.",
      /** One-line prompts in the brief textareas, as in the case Details step. */
      placeholders: {
        context: "Da dove siete partiti? Cosa serviva al cliente, e perché?",
        solution: "Cosa avete fatto, e con quale idea?",
      },
      /**
       * Settore (owner, 2026-10-22): one sector, from a shared list anyone may add to.
       * The sector labels come from the database (`client_sector`), not from here.
       */
      sector: {
        /** The add field's accessible name. */
        newName: "Nuovo settore",
        placeholder: "Per esempio: Nautica",
        /** The add button: visible text, then its accessible name (the panel has other Aggiungi). */
        add: "Aggiungi",
        addName: "Aggiungi settore",
        /** `{min}`–`{max}` characters. */
        length: "Da {min} a {max} caratteri.",
        addFailed: "Non siamo riusciti ad aggiungerlo. Riprova.",
        /** Salva or Aggiungi with a sector typed but not added. */
        pending: "Premi Aggiungi per usare questo settore.",
        /** Polite live-region line once a sector is selected from the field; `{label}` is its name. */
        selected: "{label} selezionato.",
      },
      /** The description's live counter: `{n}` characters of `{max}`. */
      counter: "{n}/{max}",
      /** `{size}` MB and `{px}` pixels on the short side (PNG, JPEG and WebP only). */
      logoHint: "PNG, JPEG, WebP o SVG fino a {size} MB. Per PNG, JPEG e WebP almeno {px} px sul lato corto.",
      /** Under the logo of a client that has one. */
      logoReplaceHint: "Se lo sostituisci, il vecchio logo viene eliminato.",
      logoChoose: "Carica il logo",
      logoReplace: "Cambia logo",
      /** The logo preview's alt text; `{name}` is the client name. */
      logoAlt: "Logo {name}",
      /** Why Aggiungi or Salva is inactive; `{fields}` lists what is missing. */
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
    /** The image slots (Story 2.16's client material, images only). */
    images: {
      /** `{n}` images of `{max}` slots. */
      counter: "{n} di {max}",
      /** `{min}`–`{max}` images, `{px}` pixels on the short side, `{types}` the formats ("PNG, JPEG o WebP"). */
      hint: "Da {min} a {max}, almeno {px} px sul lato corto. {types}.",
      /** Joins the last two formats in `{types}`. */
      lastSeparator: " o ",
      /** Under a file the client has that is not an image: it holds a slot but is not counted. */
      notCounted: "Non conta come immagine.",
      /** The empty slot's visible label and its accessible name. */
      add: "Aggiungi",
      addLabel: "Aggiungi un’immagine",
      /** `{name}` is the file name. */
      remove: "Rimuovi {name}",
      /** Asked before removing a saved image leaves fewer than `{min}`: the removal is immediate. */
      belowMin: "Con meno di {min} immagini il cliente resta da completare. La togliamo comunque? Non si torna indietro.",
      /** A slot's thumbnail; `{n}` is its position. */
      alt: "Immagine {n}",
      uploading: "Caricamento…",
      /** Polite live-region lines; `{name}` is the file name. */
      announce: {
        done: "{name} caricato.",
        removed: "{name} rimosso.",
        error: "{name}: {message}",
      },
      errors: {
        /** `{types}` lists the formats ("PNG, JPEG o WebP"). */
        type: "Questo formato non va. Usa {types}.",
        empty: "Il file è vuoto, non l’abbiamo aggiunto.",
        /** `{size}` is the per-file limit in MB. */
        tooLarge: "Supera i {size} MB, non l’abbiamo caricata.",
        /** A file over the `{max}` on the server. */
        limit: "Al massimo {max} file.",
        /** An image under `{min}` px on the short side or over `{max}` px on a side. */
        pixels: "Le misure non vanno: serve almeno {min} px sul lato corto e al massimo {max} px per lato.",
        rejected: "Il file arrivato non è quello scelto, quindi non l’abbiamo caricato.",
        /** Any other refusal that a retry can't fix. */
        refused: "Questo file non possiamo caricarlo.",
        failed: "Caricamento non riuscito. Salva per riprovare.",
        storage: "Il caricamento dei file non è ancora attivo: manca lo spazio di archiviazione. Scrivi a un amministratore.",
        remove: "Non siamo riusciti a rimuovere l’immagine. Riprova.",
      },
    },
    /** On the client page, inactive until the configurator exists. */
    layout: "Modifica layout",
    layoutReason: "Arriva con il configuratore",
    /** Elimina cliente at the bottom of the edit panel (owner, 2026-10-19). */
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
  },
  /**
   * **Scarica** and its format picker, on a client card (the client pack) and on an
   * approved case's row. The file itself comes with Stories 5.3 and 5.9.
   */
  download: {
    action: "Scarica",
    cancel: "Annulla",
    close: "Chiudi",
    /** Read by screen readers on a case row's button; `{name}` is the case name. */
    caseLabel: "Scarica {name}",
    /** Read by screen readers on a client card's button; `{name}` is the client name. */
    packLabel: "Scarica il pack di {name}",
    packTitle: "Pack di {name}",
    /** `{n}` approved cases of the client. */
    packDescription: "Intro e {n} case approvate in un solo file.",
    packDescriptionOne: "Intro e una case approvata in un solo file.",
    caseTitle: "Scarica {name}",
    caseDescription: "Scegli il formato.",
    /** Read by screen readers: names the list of formats. */
    formats: "Formato",
    soon: "In arrivo",
    /** The formats the picker offers today, keyed by `FormatId` (Video is still upcoming). */
    format: {
      presentazione_16_9: { name: "Presentazione", hint: "Per presentazioni e call" },
      carosello_1_1: { name: "Carosello 1080×1080", hint: "Instagram e LinkedIn" },
    },
    /** Formats shown greyed out with *In arrivo*. */
    upcoming: {
      video: "Video 1080×1920",
      linkedinCover: "Cover LinkedIn 1200×675",
      pngPack: "Pack PNG HD + ZIP",
    },
  },
  /** Sign-in, sign-up and passwords (Story 6.1; open sign-up per owner, 2026-10-28). */
  auth: {
    email: "Email",
    password: "Password",
    signIn: {
      title: "Bentornato",
      lead: "Accedi con la tua email e la tua password.",
      submit: "Accedi",
      forgot: "Password dimenticata?",
      noAccount: "Prima volta qui?",
      toSignUp: "Registrati",
      invalidCredentials: "Email o password non corrette. Riprova.",
      notConfirmed: "Conferma prima la tua email: ti abbiamo mandato un link.",
      inactive: "Il tuo account non è attivo. Scrivi a un amministratore.",
      linkInvalid: "Il link è scaduto o è già stato usato. Accedi, oppure chiedi un nuovo link.",
    },
    signUp: {
      title: "Crea il tuo account",
      lead: "Per chi ha un indirizzo @{domain}. Gli altri li aggiunge un amministratore.",
      firstName: "Nome",
      lastName: "Cognome",
      team: "Cosa fai in MAC",
      teamPlaceholder: "Scegli",
      teams: {
        designer: "Designer",
        account: "Account",
        commerciale: "Commerciale",
        altro: "Altro",
      },
      otherTitle: "Il tuo ruolo",
      otherTitlePlaceholder: "Per esempio: video editor",
      designerHint: "Un amministratore approva i designer. Intanto vedi i case approvati.",
      passwordHint: "Almeno {n} caratteri.",
      submit: "Crea account",
      haveAccount: "Hai già un account?",
      toSignIn: "Accedi",
      domainNotAllowed: "Usa il tuo indirizzo @{domain}. Se non ce l'hai, chiedi a un amministratore di aggiungerti.",
      invalid: "Controlla i campi evidenziati.",
      /** `{fields}`: the labels of the fields to fix, e.g. "Cosa fai in MAC, Password". */
      invalidFields: "Da completare: {fields}.",
      sentTitle: "Controlla la posta",
      sent: "Ti abbiamo mandato un link a {email}. Aprilo per confermare l'indirizzo e entrare.",
    },
    forgot: {
      title: "Nuova password",
      lead: "Scrivi la tua email: ti mandiamo un link per sceglierne una nuova.",
      submit: "Invia il link",
      sent: "Se l'indirizzo ha un account, ti è appena arrivato un link. Controlla anche lo spam.",
      back: "Torna all'accesso",
    },
    setPassword: {
      title: "Scegli la password",
      lead: "La userai per accedere a MAC Recap con {email}.",
      submit: "Salva password",
    },
    rateLimited: "Troppi tentativi. Aspetta qualche minuto e riprova.",
    failed: "Non siamo riusciti a completare l'operazione. Riprova tra poco.",
  },
  /** The admin's Organizzazione screen (Story 6.3): people, their Permessi and their Ruolo. */
  users: {
    title: "Organizzazione",
    lead: "Chi entra in MAC Recap e cosa può fare.",
    add: "Aggiungi utente",
    columns: {
      name: "Nome",
      email: "Email",
      /** Free text: what the person does in the team; grants nothing. */
      jobTitle: "Ruolo",
      /** The fixed role (`Role`): what the person can do. */
      role: "Permessi",
      added: "Aggiunto il",
      actions: "Azioni",
    },
    /** Under the name of someone who signed up as designer and waits. */
    designerRequest: "Chiede i permessi Owner",
    approve: "Approva",
    approveLabel: "Dai a {name} i permessi Owner",
    roleLabel: "Permessi di {name}",
    jobTitleLabel: "Ruolo di {name}",
    jobTitlePlaceholder: "Aggiungi ruolo",
    remove: "Rimuovi",
    removeLabel: "Rimuovi {name}",
    you: "tu",
    empty: "Nessun utente, per ora.",
    addDialog: {
      title: "Aggiungi utente",
      description: "Riceverà un'email per scegliere la password.",
      firstName: "Nome",
      lastName: "Cognome",
      email: "Email",
      jobTitle: "Ruolo",
      jobTitlePlaceholder: "Per esempio: art director",
      role: "Permessi",
      submit: "Invia invito",
      cancel: "Annulla",
      close: "Chiudi",
    },
    removeDialog: {
      title: "Rimuovere {name}?",
      description: "Non potrà più entrare. I suoi case, i link e lo storico restano.",
      confirm: "Rimuovi",
      cancel: "Annulla",
    },
    added: "Invito inviato a {email}.",
    addedNoInvite: "{email} ha già un accesso: può entrare con la sua password o usare Password dimenticata.",
    errors: {
      lastAdmin: "Serve almeno un amministratore. Nomina prima qualcun altro.",
      exists: "Questa email ha già un account.",
      invalid: "Controlla i campi evidenziati.",
      invite: "Abbiamo creato l'utente ma l'email non è partita. Riprova tra poco.",
      failed: "Non siamo riusciti a salvare. Riprova.",
    },
  },
  /** Library of approved cases (Story 5.1); until it ships, a placeholder. */
  library: {
    title: "Libreria",
    lead: "Qui troverai i case approvati, pronti da scaricare e condividere.",
    soon: "La libreria è in arrivo. Ti avvisiamo appena è pronta.",
  },
  /**
   * The configurator (Story 4.2a, mockup `configurator.html`): top bar, left panel
   * (selection, page tools, theme), canvas and right panel (Pagine, Media).
   */
  configurator: {
    /** Accessible name of the top bar's back arrow. */
    back: "Torna alle case history",
    /** Read by screen readers before the code in the top bar. */
    codeLabel: "ID",
    /** Below 1024 px, instead of the frame. */
    narrowScreen: "Il configuratore ha bisogno di uno schermo più grande.",
    /** The format switch, keyed by `FormatId`; the ratio comes from the format registry. */
    formats: {
      label: "Formato",
      presentazione_16_9: "Presentazione",
      carosello_1_1: "Carosello",
      video_9_16: "Video",
    },
    saved: "Salvato",
    /** The top bar's save state while a save runs, and after a failed one (Story 4.3a). */
    saving: "Salvataggio…",
    retrying: "Non salvato. Nuovo tentativo…",
    /** After 3 failed saves in a row, above the canvas until a save goes through. */
    saveBanner: "Le modifiche non si salvano. Tieni aperta questa scheda.",
    undo: "Annulla",
    redo: "Ripeti",
    /** Keyboard hints on undo and redo. */
    undoHint: "Annulla (⌘Z)",
    redoHint: "Ripeti (⇧⌘Z)",
    approve: "Approva",
    /** A block whose text no longer fits (Story 4.3a). */
    overflow: "Il testo non entra",
    /** Double-click on a text that can't be edited yet: bound to the client or the case (4.3d), or an approved case (4.9). */
    editSoon: "Questo testo si potrà modificare presto.",
    /** The hint on a tool that arrives with a later story. */
    soon: "Arriva presto",
    /** The canvas message when a tool that isn't here yet is pressed. */
    soonMessage: "{tool} arriva presto.",
    /** A case with no revision yet: the template's starter pages, nothing saved. */
    trial: {
      title: "Bozza di prova",
      body: "Sono le pagine di partenza, con le immagini della case e i testi ancora vuoti. Per ora non salviamo nulla.",
    },
    canvas: {
      label: "Pagine",
      /** Above each page: its number and name. */
      pageLabel: "{n} · {name}",
      empty: "Nessuna pagina in questo formato.",
      /** On the selected block. */
      move: "⠿ Sposta",
    },
    /** Section labels, keyed by `PageSection`. */
    sections: {
      intro: "Intro",
      output: "Output",
      risultati: "Risultati",
    },
    panels: {
      left: "Proprietà",
      right: "Pagine e media",
      hideLeft: "Nascondi il pannello a sinistra",
      showLeft: "Mostra il pannello a sinistra",
      hideRight: "Nascondi il pannello a destra",
      showRight: "Mostra il pannello a destra",
      hide: "Nascondi pannello",
      show: "Mostra pannello",
    },
    /** The left panel's crumbs above the selection's name. */
    crumbs: {
      page: "Pagina",
      block: "Blocco",
    },
    tools: {
      layout: "Layout",
      /** A layout thumbnail's accessible name. */
      layoutOption: "Layout {name}",
      defaultPages: "Pagine di default",
      elements: "Elementi",
      background: "Sfondo",
      backgroundOf: "Sfondo · {what}",
      backgroundPage: "pagina",
      backgroundBlock: "blocco",
      solid: "Tinta unita",
      image: "Immagine",
      deletePage: "Elimina pagina",
      /** Moves the page to the next layout with the same number of blocks (Story 4.4a). */
      shuffle: "Mescola",
      /** Sfondo's colour field: its label and accessible name. */
      colour: "Colore",
      colourField: "Colore dello sfondo",
      /** Sfondo's swatches, keyed by colour (C30). */
      swatches: {
        "#ffffff": "Bianco",
        "#ededf0": "Grigio",
        "#012234": "Blu notte",
        "#defe56": "Lime",
        "#2977ff": "Blu",
        transparent: "Trasparente",
      },
    },
    /** The left panel with a text selected (Story 4.3b, C32). */
    text: {
      heading: "Testo · {format}",
      style: "Stile",
      align: "Allinea",
      alignLeft: "Sinistra",
      alignCentre: "Centro",
      alignRight: "Destra",
      colour: "Colore",
      /** The colour field's accessible name. */
      colourField: "Colore del testo",
      /** The swatch, and the field's value, for no colour. */
      transparent: "Trasparente",
      columns: "Colonne",
      /** The columns buttons' accessible names. */
      oneColumn: "Una colonna",
      twoColumns: "Due colonne",
    },
    /** The left panel with a Testi group selected (C30). */
    group: {
      heading: "Allineamento nel blocco",
      top: "In alto",
      centre: "Al centro",
      bottom: "In basso",
      splitOne: "Distanziati: il primo testo in alto, il resto in basso",
      splitMany: "Distanziati: i primi {n} testi in alto, il resto in basso",
    },
    /** Adding, copying and removing elements and blocks (Story 4.3c). */
    edit: {
      needBlock: "Seleziona un blocco, oppure trascina l’elemento dentro un blocco.",
      pageFull: "Questa pagina ha già 6 blocchi.",
      copied: "Blocco copiato.",
      cut: "Blocco tagliato.",
      elementRemoved: "Elemento eliminato. ⌘Z per annullare.",
      blockRemoved: "Blocco eliminato. ⌘Z per annullare.",
      removeElement: "Rimuovi elemento",
      removeBlock: "Rimuovi blocco",
      /** In an empty block, in the editor only. */
      emptyBlock: "Trascina qui un elemento",
      /** A new block's name. */
      newBlock: "Blocco",
      /** A layout with fewer cells than the page's filled blocks (Story 4.4a); `{k}` blocks over. */
      layoutOver: "La pagina ha {k} blocchi in più di questo layout: toglili prima.",
      layoutOverOne: "La pagina ha 1 blocco in più di questo layout: toglilo prima.",
      /** Sfondo's colour field got something that isn't a colour. */
      badColour: "Scrivi un colore come #2977FF.",
      /** Risultati e testimonial on a case with neither (Story 4.4c): nothing to lay out. */
      defaultEmpty: "Questo caso non ha né risultati né testimonianza.",
    },
    /** The words of a text added from Elementi: placeholders to type over. */
    newTexts: {
      title: "Nuovo titolo",
      text: "Scrivi qui il testo.",
      number: "+00%",
      quote: "«La citazione del cliente.»",
      label: "Etichetta",
      /** The title inside a new Testi group. */
      groupTitle: "Titolo",
    },
    /** The Elementi list, in the mockup's order. */
    elements: {
      block: "Blocco",
      group: "Testi",
      title: "Titolo",
      text: "Testo",
      number: "Numero",
      quote: "Citazione",
      label: "Etichetta",
      image: "Immagine",
      video: "Video",
      animation: "Animazione",
    },
    /** A selected element's name, keyed by element type (a text shows its style's name). */
    elementTypes: {
      text: "Testo",
      text_group: "Testi",
      row: "Riga",
      image: "Immagine",
      video: "Video",
      animation: "Animazione",
      services: "Servizi",
      logos: "Loghi",
      divider: "Linea",
    },
    tabs: {
      label: "Contenuto del pannello",
      pages: "Pagine",
      media: "Media",
    },
    search: {
      label: "Cerca tra le pagine",
      /** On the Media tab. */
      mediaLabel: "Cerca tra i media",
      placeholder: "Cerca",
    },
    /**
     * The Media tab (Story 4.5a, mockup `renderRight`): the case's images and videos, a star
     * per file and the drop zone at its foot.
     */
    media: {
      label: "Media della case",
      empty: "Ancora nessuna immagine o video. Trascinali qui sotto.",
      /** `{query}` is the search text. */
      noMatch: "Nessun file per “{query}”.",
      /** Read after a file's name when it is on a page of the format in view. */
      onPage: "sulla pagina",
      /** `{length}` is m:ss. */
      videoLength: "video di {length}",
      favourite: {
        add: "Aggiungi ai preferiti",
        remove: "Togli dai preferiti",
      },
      drop: {
        lead: "Trascina qui immagini e video",
        hint: "Finiscono nei Media di questa case.",
        /** After `lead` in the drop zone's accessible name: as a button it opens the file picker. */
        choose: "oppure sceglili dai file",
        /** `{n}` files still uploading. */
        uploading: "Caricamento di {n} file…",
      },
      /** `{n}` files uploaded in one go. */
      uploaded: "{n} file caricati.",
      errors: {
        type: "Qui vanno solo immagini e video.",
      },
    },
    view: {
      label: "Vista",
      grid: "Anteprime",
      list: "Elenco",
    },
    noMatch: "Nessuna pagina per “{query}”.",
    /**
     * Anteprima (Story 4.2b, C37): the top bar's eye, the Carosello and Video slideshow
     * and, on Video, Instagram's interface drawn over the page (C34).
     */
    preview: {
      enter: "Anteprima",
      leave: "Torna all’editor",
      previous: "Pagina precedente",
      next: "Pagina successiva",
      /** Under the slideshow. */
      slide: "{i} di {n} · {name}",
      instagram: {
        label: "Anteprima Instagram",
        off: "Nessuna",
        reel: "Reel",
        story: "Storia",
        /** The account shown in the overlay. */
        account: "mac.creativetech",
        /** The account's avatar. */
        avatar: "mac",
        /** The phone's clock in the status bar. */
        clock: "9:41",
        follow: "Segui",
        forYou: "Per te",
        friends: "Amici",
        message: "Invia messaggio…",
        /** How long ago the Story was posted. */
        time: "9 min",
      },
    },
    /** The Video editor's switch that stops the text loop while working on a page. */
    textAnimation: "Animazione testi",
  },
  /**
   * An approved case's read-only detail page (Story 5.2): each format as in the
   * configurator's Anteprima, with **Scarica** and, with `edit`, **Modifica**.
   */
  caseView: {
    /** Accessible name of the top bar's back arrow. */
    back: "Torna alle case history",
    /** Opens the configurator. */
    edit: "Modifica",
    /** Below 1024 px, instead of the preview. */
    narrowScreen: "L’anteprima ha bisogno di uno schermo più grande.",
    /** The collections the case appears in (filled by Story 5.10; empty until then). */
    collections: {
      heading: "Raccolte",
      empty: "Non è in nessuna raccolta.",
    },
    /** *Attività* for this case (Home's sentences, heading and failed line); this is its empty line. */
    activityEmpty: "Ancora nessuna attività.",
    /** The preview panel's toolbar: zoom and full screen (the pager reuses the configurator's slideshow copy). */
    viewer: {
      zoomOut: "Riduci",
      zoomIn: "Ingrandisci",
      /** The middle of the zoom control: the current size, 100% being Adatta. */
      zoom: "{n}%",
      /** Where the slide fits the panel; the % returns to it. */
      fit: "Adatta",
      /** The %'s accessible name. */
      zoomReset: "Zoom {n}%, torna ad Adatta",
      fullscreen: "Schermo intero",
      exitFullscreen: "Esci dallo schermo intero",
    },
  },
  /** Case status labels (IR-OP8 interim set), keyed by `CaseStatus`. */
  status: {
    draft: "Bozza",
    generating: "In elaborazione",
    in_review: "Da approvare",
    approved: "Approvato",
  },
  /** Permessi labels, keyed by `Role`; `system` is never shown. One word each (owner, 2026-10-28). */
  role: {
    owner_designer: "Owner",
    account_sales_social: "Editor",
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

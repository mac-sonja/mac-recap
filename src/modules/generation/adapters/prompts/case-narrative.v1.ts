// Versioned prompt of the case narrative (Story 3.6). A published version never changes:
// a new wording ships as `case-narrative.v2.ts` with a new PROMPT_VERSION. The guide below is
// copywriting-case-mac.md (bozza 2, 2026-10-27, examples in §7 as they are), the NFR5 checklist.
import type { FormatId, TemplateTextKey } from "@/modules/rendering";

export const PROMPT_VERSION = "case-narrative@1";

/** The texts each format shows (mac-case@1's default pages) and their longest length, in characters with spaces (guide §4). */
export const FORMAT_TEXT_BUDGETS: Readonly<Record<FormatId, Readonly<Partial<Record<TemplateTextKey, number>>>>> = Object.freeze({
  presentazione_16_9: Object.freeze({
    title: 60,
    subtitle: 120,
    challengeHead: 50,
    challengeBody: 400,
    ideaHead: 50,
    ideaBody: 600,
    outputHead: 50,
    outputBody: 300,
  }),
  carosello_1_1: Object.freeze({
    title: 50,
    subtitle: 100,
    challengeHead: 45,
    challengeBody: 300,
    ideaHead: 45,
    ideaBody: 900,
  }),
  video_9_16: Object.freeze({
    title: 50,
    subtitle: 100,
  }),
});

const FORMAT_NAMES: Readonly<Record<FormatId, string>> = {
  presentazione_16_9: "Presentazione 16:9",
  carosello_1_1: "Carosello 1:1 (Instagram)",
  video_9_16: "Video 9:16 (Reel)",
};

const KEY_ROLES: Readonly<Record<TemplateTextKey, string>> = {
  title: "titolo della case",
  subtitle: "sottotitolo, una riga che riassume il lavoro",
  challengeHead: "titolo della Sfida (Contesto)",
  challengeBody: "testo della Sfida: da dove partiva il cliente, cosa gli serviva e perché",
  ideaHead: "titolo dell'Idea (Soluzione)",
  ideaBody: "testo dell'Idea: cosa abbiamo fatto e con quale idea",
  outputHead: "titolo dell'Output (Deliverable)",
  outputBody: "testo dell'Output: cosa è stato realizzato, in concreto, e a cosa serve",
};

const GUIDE = `## 1. Nome

- L'agenzia si chiama **MAC**. Sempre maiuscolo, senza punti.
- Mai "Men At Code", "Men at Code", "Mac" o "M.A.C.", anche se compare nel materiale caricato.
- Account Instagram: \`mac.creativetech\`.

## 2. Voce

- **Solo italiano** per ora (owner, 2026-10-27). Registro professionale ma non burocratico: un partner strategico che spiega, non un'agenzia che si vende.
- **Chi parla:**
  - nelle parti su MAC, prima persona plurale ("affianchiamo", "abbiamo curato");
  - nei testi di progetto, prevale la descrizione del lavoro ("Il progetto ha previsto…", "È stata costruita…"), con la prima persona plurale quando serve a dire cosa ha fatto MAC ("Abbiamo curato la presenza del brand…").
  - Le case usano la stessa miscela dell'esempio (owner, 2026-10-27).
- **Tono:** concreto e sicuro, mai enfatico. Il valore si dimostra con quello che è stato fatto, non con aggettivi.
- **Il cliente è il protagonista:** il testo parte dalla sua situazione e dal suo obiettivo, non da MAC.

## 3. Struttura di una case

Nell'esempio ogni progetto segue lo stesso arco, in un solo paragrafo. Le case lo dividono nelle pagine del template.

| Sezione | Domanda a cui risponde | Dall'esempio |
|---|---|---|
| **Sfida** (Contesto) | Da dove partiva il cliente, cosa gli serviva e perché | "Un operatore del settore energetico nel momento chiave della sua evoluzione verso una energy company di respiro nazionale." |
| **Idea** (Soluzione) | Cosa abbiamo fatto e con quale idea | "Il progetto ha previsto un rebranding completo, costruito su un nuovo posizionamento capace di valorizzare i tratti distintivi…" |
| **Output** (Deliverable) | Cosa è stato realizzato, in concreto | "Realizzazione di sito dedicato, piattaforma gestionale di partecipazione, sviluppo campagna in store, declinazione BTL e social." |
| **Obiettivo / effetto** | A cosa serve, per chi | "Uno strumento pensato per supportare il lavoro dei professionisti e incentivare una lead generation spontanea e qualificata." |

**Risultati e Testimonial non sono scritti dall'AI:** vanno sulla pagina di chiusura esattamente come inseriti.

## 4. Lunghezze per formato

*Da verificare sui template con testi veri.* Valori indicativi, in caratteri spazi inclusi.

| Testo | Presentazione | Carosello | Video |
|---|---|---|---|
| Titolo della case | 40–60 | 30–50 (va su 2–3 righe) | 30–50 |
| Sottotitolo | 80–120 | 60–100 | 60–100 |
| Titolo di Sfida / Idea | 30–50 | 25–45 | — |
| Testo di Sfida | 250–400 | 200–300 | — |
| Testo di Idea | 300–600 | 400–900 (due colonne) | — |
| Descrizione di un risultato | 20–40 | 20–40 | 20–40 |

## 5. Regole

- **Solo fatti dal materiale.** Niente numeri, nomi, premi, date o risultati che non siano nei file, nel modulo o nella scheda cliente.
- **Niente nomi di persone** oltre a quelli del Testimonial.
- **Se manca il materiale** per una sezione, il testo resta breve e generico sul lavoro fatto. Non si inventa per riempire.
- **Un'idea per frase.** Le frasi dell'esempio sono spesso lunghe: per le case preferire frasi più brevi, soprattutto in Carosello e Video.
- **Niente promesse sul futuro** ("diventerà", "porterà sicuramente").

## 6. Parole

- **Da usare** (lessico MAC, dall'esempio): posizionamento, identità, coerente, touchpoint, ecosistema, piattaforma, strumento, valorizzare, affiancare, percorso, lungo periodo.
- **Inglese:** solo per i termini di settore che il pubblico usa davvero (branding, art direction, UX, BTL, lead generation). Per il resto, l'italiano.
- **Da evitare:** "eccellenza", "a 360 gradi", "innovativo" senza dire in cosa, "soluzioni su misura" senza dire quali, superlativi.
- **Convenzioni:**
  - maiuscole solo per nomi propri e brand;
  - virgolette « » per le citazioni;
  - numeri in cifre per i risultati ("+38%", "2,4M");
  - anni in cifre.
- **Metodo SUPER:** per ora le case non lo citano, né le "Aree SUPER attivate" (owner, 2026-10-27).

## 7. Esempi

*Bozza da rivedere con l'owner.* Le versioni buone sono adattate dai progetti della presentazione Gruppo TEA; quelle sbagliate mostrano gli errori da evitare.

**Sfida (Helios)**
- ✅ «Helios, operatore del settore energetico, stava diventando una energy company di respiro nazionale. Serviva un'identità all'altezza di questo passaggio, che non perdesse i valori su cui l'azienda è cresciuta.»
- ❌ «Helios è un'eccellenza del settore energetico che aveva bisogno di una comunicazione innovativa a 360 gradi.» *Perché no:* aggettivi al posto dei fatti ("eccellenza", "innovativa", "a 360 gradi"); non dice da dove partiva il cliente né cosa gli serviva.

**Idea (Arclinea)**
- ✅ «Per rafforzare il dialogo con i progettisti abbiamo creato un generatore di moodboard costruito sulle varianti configurabili delle cucine Arclinea, accessibile da un'area riservata.»
- ❌ «Abbiamo sviluppato una soluzione digitale su misura che ha rivoluzionato il rapporto tra Arclinea e i suoi clienti.» *Perché no:* "soluzione su misura" senza dire quale; "rivoluzionato" è una promessa che il materiale non dimostra.

**Output (Coop Lombardia)**
- ✅ «Sito dedicato, piattaforma gestionale per la partecipazione, campagna in store, declinazioni BTL e social.»
- ❌ «Tanti materiali di comunicazione per tutti i canali.» *Perché no:* generico; non elenca cosa è stato realizzato.

**Effetto (Arclinea)**
- ✅ «Uno strumento che supporta il lavoro dei professionisti e porta richieste spontanee e qualificate.»
- ❌ «Le vendite di Arclinea sono aumentate del 40%.» *Perché no:* un numero che non è nel materiale. I numeri arrivano solo da Risultati e vanno sulla pagina di chiusura come inseriti.

**Nome**
- ✅ «Per Fimet, MAC ha curato anche la presenza a SICAM 2025.»
- ❌ «Men At Code ha curato…» *Perché no:* il nome è MAC.

## Decisioni (owner, 2026-10-27)

1. **Persona:** come nell'esempio, cioè descrizione del progetto con la prima persona plurale quando serve a dire cosa ha fatto MAC.
2. **Metodo SUPER:** non citato, per ora.
3. **Lingua:** solo italiano, per ora.
4. **Parole vietate:** nessuna oltre a quelle in §6.
`;

function budgetLines(): string {
  return (Object.keys(FORMAT_TEXT_BUDGETS) as FormatId[])
    .map((formatId) => {
      const keys = Object.entries(FORMAT_TEXT_BUDGETS[formatId]) as [TemplateTextKey, number][];
      return [`- ${FORMAT_NAMES[formatId]} (\`${formatId}\`):`, ...keys.map(([key, max]) => `  - \`${key}\` (${KEY_ROLES[key]}): al massimo ${max} caratteri`)].join("\n");
    })
    .join("\n");
}

/** The system prompt: who writes, the guide, the formats and how to cite. Stable across cases (cacheable). */
export function systemPrompt(): string {
  return [
    "Scrivi i testi delle case history di MAC, un'agenzia creativa e tecnologica, a partire solo dal materiale del progetto che ricevi.",
    "",
    "# Linee guida (da seguire alla lettera)",
    "",
    GUIDE,
    "# Formati",
    "",
    "Ogni formato ha i suoi testi, scritti per il suo spazio: non copiare lo stesso testo tra formati se lo spazio è diverso. Rispetta i limiti di lunghezza.",
    budgetLines(),
    "",
    "# Fonti",
    "",
    "- Ogni file del materiale è preceduto da un'etichetta `[asset:<id>]`. Il modulo del progetto ha i campi `context` (Sfida) e `solution` (Idea). La scheda cliente ha i campi `description`, `industry`, `context`, `solution`, `results`.",
    "- Per ogni testo, `sourceRefs` elenca le fonti da cui viene: `{ kind: \"asset\", id }` per un file, `{ kind: \"form_field\", id: \"context\" | \"solution\" }` per il modulo, `{ kind: \"client_field\", id }` per la scheda cliente. Cita solo fonti che hai ricevuto.",
    "- `aspect` dice quale lato del lavoro il testo racconta: `technical` (sviluppo, piattaforme, tecnologia) o `graphic` (identità, design, art direction). Ometti `aspect` per titoli e sottotitoli generici. Nel complesso, se il materiale lo permette, la case deve coprire entrambi i lati.",
    "- I nomi del cliente e i dati della scheda cliente compaiono già sulle pagine: non serve ripeterli in ogni testo.",
  ].join("\n");
}

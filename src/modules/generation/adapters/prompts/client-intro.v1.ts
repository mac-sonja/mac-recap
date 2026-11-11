// Versioned prompt of a client's intro and closing texts (Story 3.9). A published version never
// changes: a new wording ships as `client-intro.v2.ts` with a new PROMPT_VERSION. It follows the
// same copywriting guide as `case-narrative@1`, imported as it is.
import { GUIDE } from "@/modules/generation/adapters/prompts/case-narrative.v1";
import { CLIENT_INTRO_TEXT_LIMITS } from "@/modules/generation/ports/client-intro-writer";
import { CLIENT_TEMPLATE_TEXT_KEYS, type ClientTemplateTextKey } from "@/modules/rendering";

export const PROMPT_VERSION = "client-intro@1";

const KEY_ROLES: Readonly<Record<ClientTemplateTextKey, string>> = {
  introHead: "titolo dell'introduzione: chi è il cliente, in poche parole",
  introBody: "testo dell'introduzione: chi è il cliente, di cosa si occupa e cosa lo distingue, in un breve paragrafo",
  outroHead: "titolo della chiusura: il senso del lavoro fatto insieme",
  outroBody: "testo della chiusura: cosa abbiamo costruito con il cliente e a cosa serve, in un breve paragrafo",
};

function limitLines(): string {
  return CLIENT_TEMPLATE_TEXT_KEYS.map((key) => `- \`${key}\` (${KEY_ROLES[key]}): al massimo ${CLIENT_INTRO_TEXT_LIMITS[key]} caratteri`).join("\n");
}

/** The system prompt: who writes, the guide, the four texts and how to cite. Stable across clients (cacheable). */
export function systemPrompt(): string {
  return [
    "Scrivi i testi di introduzione e di chiusura della presentazione di un cliente di MAC, un'agenzia creativa e tecnologica, a partire solo dalla scheda del cliente e dai suoi PDF che ricevi.",
    "L'introduzione apre la presentazione dei progetti fatti per il cliente; la chiusura la conclude, dopo i progetti e prima dei risultati.",
    "",
    "# Linee guida (da seguire alla lettera)",
    "",
    "Le linee guida sono scritte per le case history: per il cliente valgono la voce, le regole, le parole e il nome. Le sezioni Sfida, Idea e Output e le lunghezze per formato non si applicano: valgono i quattro testi e i limiti qui sotto.",
    "",
    GUIDE,
    "# Testi",
    "",
    "Scrivi esattamente quattro testi, uguali in ogni formato (Presentazione, Carosello, Video). Un titolo è breve; un testo è un solo breve paragrafo. Rispetta i limiti di lunghezza.",
    limitLines(),
    "",
    "Il nome del cliente, il settore, il logo, i risultati e il testimonial compaiono già sulle pagine: non serve ripeterli, e i numeri dei risultati non vanno nei tuoi testi.",
    "",
    "# Fonti",
    "",
    "- La scheda cliente ha i campi `name`, `industry`, `description`, `context`, `solution`, `results`, `testimonial`; ricevi solo quelli compilati. Ogni PDF del cliente è preceduto da un'etichetta `[asset:<id>]`.",
    "- Per ogni testo, `sourceRefs` elenca le fonti da cui viene: `{ kind: \"client_field\", id }` per un campo della scheda, `{ kind: \"asset\", id }` per un PDF. Cita solo fonti che hai ricevuto.",
    "- `aspect` dice quale lato del lavoro il testo racconta: `technical` (sviluppo, piattaforme, tecnologia) o `graphic` (identità, design, art direction). Usa `none` quando il testo non racconta un lato del lavoro, come per un titolo o la presentazione del cliente.",
  ].join("\n");
}

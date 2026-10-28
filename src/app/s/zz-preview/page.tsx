import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { CASE_TEMPLATE, FORMAT_IDS, starterPages, type FormatId } from "@/modules/rendering";
import type { Page } from "@/modules/generation";
import { Configurator } from "@/app/(wizard)/_components/configurator/configurator";

// TEMPORARY preview harness for screenshots; never committed.
const svg = (a: string, b: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>`)}`;
const IMAGES = ["11111111-0000-4000-8000-000000000001", "11111111-0000-4000-8000-000000000002", "11111111-0000-4000-8000-000000000003", "11111111-0000-4000-8000-000000000004"];
const COLORS = [["#2a3d66", "#d98e5f"], ["#0e5b4a", "#c6e27a"], ["#5b2a66", "#f2b6d0"], ["#333", "#999"]];

export default async function Preview() {
  let n = 0;
  const newId = () => `22222222-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const formats = Object.fromEntries(
    FORMAT_IDS.map((id) => [id, starterPages(CASE_TEMPLATE, "case_history", id, { newId, texts: { title: "Una luce nuova per Lumen", subtitle: "Un marchio e un sito che mostrano i prodotti al buio.", challengeHead: "Un marchio forte, ma invisibile online", challengeBody: "Lumen era conosciuta dai progettisti, ma il sito non mostrava la qualità della luce.", ideaHead: "Mostrare la luce al buio", ideaBody: "Abbiamo ridisegnato il logo partendo dalla forma delle lampade.", outputHead: "Il nuovo sito", outputBody: "Ogni pagina prodotto si apre con la lampada accesa." }, images: IMAGES, resultRows: 3, hasTestimonial: true })]),
  ) as Record<FormatId, Page[]>;
  const assets = Object.fromEntries(IMAGES.map((id, i) => [id, { url: svg(COLORS[i][0], COLORS[i][1]), kind: "image" as const }]));
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <Configurator
      header={{ name: "Lumen · Rebranding e sito", code: "LUM-2026-01", status: "in_review" }}
      back={{ href: "/case-studies", label: "Torna alle case history" }}
      template={CASE_TEMPLATE}
      formats={formats}
      assets={assets}
      values={{
        client: { name: "Lumen S.r.l.", sector: "Illuminazione", description: "", logoUrl: null, results: [], testimonial: null },
        case: { year: 2026, services: ["Branding", "Web design"], results: [{ label: "richieste dal sito", value: "+38%" }, { label: "tempo sulle pagine", value: "3×" }, { label: "prodotti fotografati", value: "120" }], testimonial: { quote: "“Finalmente il sito racconta la luce.”", author: "Giulia R., Lumen" } },
      }}
      trial={false}
      theme={theme}
    />
  );
}

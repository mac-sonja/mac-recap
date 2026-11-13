import { createElement, useId, type ReactElement } from "react";
import type { DocumentElement, Page } from "@/modules/generation";
import { BrandArt } from "@/modules/rendering/brand/art";
import { BRAND_FORMAT, BRAND_TEMPLATE, BRAND_TITLE, BRAND_TITLE_ELEMENT_ID } from "@/modules/rendering/brand/pages";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { BASE_CSS, u } from "@/modules/rendering/templates/mac-case/v1/render/css";
import type { RenderInput } from "@/modules/rendering/templates/types";

/**
 * MAC's intro and outro pages drawn on their 1920×1080 frame, as the Figma frames place them
 * (Inter, line height normal, every position and size in frame units). The page shell is
 * mac-case v1's (`section.mr-page`, `BASE_CSS`: one size container, `1u = 100cqw / 1920`), so
 * exports count and print them like any page. Pure: the only words read from the page are the
 * "Our projects" title's (a collection may change them); every other text is fixed here.
 */

/** MAC's details, as the Figma outro shows them. Fixed: never a document element, never edited. */
export const MAC_DETAILS = Object.freeze({
  company: "Men At Code S.r.l.",
  site: "www.menatcode.it",
  offices: [
    { label: "Sede operativa", address: "Via Lomazzo, 27 — 20154 Milano" },
    { label: "Sede legale", address: "Via Pietro Nenni, 18 — 25124 Brescia" },
  ],
  tax: [
    { label: "P.I.", value: "04216420986" },
    { label: "C.F.", value: "03795980980" },
  ],
  group: { lead: "Società del Gruppo", name: "W-Group", href: "https://w-group.it/" },
});

const B = ".mr-page.mr-brand";

/** The brand pages' own rules, on top of mac-case v1's page shell. */
export const BRAND_CSS = [
  `${B}{background:#1455C7;color:#C8D4EA;font-family:Inter,sans-serif}`,
  `${B} .mr-brand-art{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden}`,
  `${B} .mr-brand-t{position:absolute;margin:0;font-size:${u(20)};font-weight:400;line-height:normal;letter-spacing:0;white-space:nowrap;color:#C8D4EA}`,
  `${B} .mr-brand-title{position:absolute;left:${u(40)};top:${u(40)};max-width:${u(1100)}}`,
  `${B} .mr-brand-title>.mr-txt{margin:0;font-size:${u(78)};font-weight:400;line-height:normal;letter-spacing:${u(-2.34)};color:#DEFE56;white-space:pre-line;overflow-wrap:break-word}`,
  `${B} .mr-brand-name{font-weight:500;letter-spacing:${u(-0.4)}}`,
  `${B} .mr-brand-outro-name{font-size:${u(26)};font-weight:500;letter-spacing:${u(-0.52)}}`,
  `${B} .mr-brand-col{position:absolute;left:${u(662)};top:${u(40)};display:flex;flex-direction:column;gap:${u(30)};font-size:${u(20)};line-height:normal;white-space:nowrap}`,
  `${B} .mr-brand-col p{margin:0}`,
  `${B} .mr-brand-offices{display:flex;flex-direction:column;gap:${u(20)}}`,
  `${B} .mr-brand-office{display:flex;flex-direction:column;gap:${u(4)}}`,
  `${B} .mr-brand-office>b{font-weight:600}`,
  `${B} .mr-brand-tax{display:flex;gap:${u(10)}}`,
  `${B} .mr-brand-tax>div{display:flex;flex-direction:column;gap:${u(5)}}`,
  `${B} .mr-brand-tax>div:first-child{width:${u(37)}}`,
  `${B} .mr-brand-tax>div:last-child{width:${u(136)}}`,
  `${B} .mr-brand-group{right:${u(40)};text-align:right}`,
  `${B} .mr-brand-group>i{font-weight:300;font-style:italic}`,
  `${B} .mr-brand-group>a{color:inherit;text-decoration:underline;text-underline-offset:auto}`,
].join("\n");

/** The title's words: the page's own free text (a collection's copy may hold other words). */
function titleOf(page: Page): string {
  const walk = (elements: readonly DocumentElement[]): string | undefined => {
    for (const el of elements) {
      if (el.elementId === BRAND_TITLE_ELEMENT_ID) return el.type === "text" && el.text !== undefined ? el.text : undefined;
      if (el.type === "text_group" || el.type === "row") {
        const found = walk(el.items);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const block of page.blocks) {
    const found = walk(block.elements);
    if (found !== undefined) return found;
  }
  return BRAND_TITLE;
}

function Intro({ page }: { page: Page }) {
  const uid = useId();
  const block = page.blocks.find((b) => b.elements.some((el) => el.elementId === BRAND_TITLE_ELEMENT_ID));
  return (
    <>
      <BrandArt uid={uid} kind="intro" />
      <div className="mr-brand-title" data-block-id={block?.blockId}>
        <div className="mr-txt" data-element-id={BRAND_TITLE_ELEMENT_ID}>
          {titleOf(page)}
        </div>
      </div>
      <p className="mr-brand-t mr-brand-name" style={{ left: u(40), top: u(1009) }}>
        {MAC_DETAILS.company}
      </p>
      <p className="mr-brand-t" style={{ left: u(1703), top: u(1016) }}>
        {MAC_DETAILS.site}
      </p>
    </>
  );
}

function Outro() {
  const uid = useId();
  return (
    <>
      <BrandArt uid={uid} kind="outro" />
      <p className="mr-brand-t mr-brand-outro-name" style={{ left: u(40), top: u(40) }}>
        {MAC_DETAILS.company}
      </p>
      <div className="mr-brand-col">
        <div className="mr-brand-offices">
          {MAC_DETAILS.offices.map((office) => (
            <p key={office.label} className="mr-brand-office">
              <b>{office.label}</b>
              <span>{office.address}</span>
            </p>
          ))}
        </div>
        <div className="mr-brand-tax">
          <div>
            {MAC_DETAILS.tax.map((row) => (
              <span key={row.label}>{row.label}</span>
            ))}
          </div>
          <div>
            {MAC_DETAILS.tax.map((row) => (
              <span key={row.label}>{row.value}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="mr-brand-t" style={{ left: u(1283), top: u(40) }}>
        {MAC_DETAILS.site}
      </p>
      <p className="mr-brand-t mr-brand-group" style={{ top: u(40) }}>
        <i>{MAC_DETAILS.group.lead}</i> <a href={MAC_DETAILS.group.href} target="_blank" rel="noopener noreferrer">{MAC_DETAILS.group.name}</a>
      </p>
    </>
  );
}

/** One brand page: the intro (role `intro`) or the outro. */
function BrandPageView({ page, number, formatId }: { page: Page; number: number; formatId: FormatId }) {
  return (
    <section
      className="mr-page mr-brand"
      data-format={formatId}
      data-page-key={page.pageKey}
      data-role={page.role}
      data-section={page.section}
      data-page-number={number}
      data-brand=""
    >
      {page.role === "intro" ? <Intro page={page} /> : <Outro />}
    </section>
  );
}

function BrandRender({ formatId, input }: { formatId: FormatId; input: RenderInput }) {
  const options = input.options ?? {};
  const start = Number.isFinite(options.startPage) ? Math.trunc(options.startPage as number) : 1;
  return (
    <div className="mr-root" data-template={BRAND_TEMPLATE} data-format={formatId}>
      <style dangerouslySetInnerHTML={{ __html: `${BASE_CSS}\n${BRAND_CSS}` }} />
      {input.pages.map((page, i) => (
        <BrandPageView key={`${i}-${page.pageKey}`} page={page} number={start + i} formatId={formatId} />
      ))}
    </div>
  );
}

/**
 * MAC's pages drawn (`renderFormat` with `BRAND_TEMPLATE`): the same element for the
 * configurators, the case view, collections and exports. Presentazione only: any other format
 * is a bug.
 */
export function renderBrand(formatId: FormatId, input: RenderInput): ReactElement {
  if (formatId !== BRAND_FORMAT) throw new Error(`${BRAND_TEMPLATE} draws ${BRAND_FORMAT} only, not ${formatId}`);
  return createElement(BrandRender, { formatId, input });
}

import { describe, expect, it } from "vitest";
import { decodeUtf8, isSafeSvg, isSafeSvgBytes, scanSvg, scanSvgBytes } from "./svg-safety";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const wrap = (inner: string, attrs = "") => `<svg ${NS} ${XLINK} viewBox="0 0 100 100"${attrs}>${inner}</svg>`;
const utf8 = (text: string) => new TextEncoder().encode(text);

describe("isSafeSvg: accepted", () => {
  it.each([
    ["a clean SVG", wrap('<path d="M0 0L100 100Z" fill="#000"/>')],
    ["a ~3 KB clean SVG", wrap(`<path d="${"M0 0L10 10 ".repeat(280)}"/>`)],
    ["an XML declaration, comments and trailing whitespace", `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: x -->\n${wrap("<rect/>")}\n\n`],
    ["a UTF-8 BOM", `\ufeff${wrap("<rect/>")}`],
    ["an internal href", wrap('<defs><path id="a" d="M0 0"/></defs><use href="#a"/>')],
    ["an internal xlink:href with spaces", wrap('<use xlink:href = " #a" />')],
    ["an internal url()", wrap('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><rect style="fill: url( \'#g\' )"/>')],
    ["a style block with CDATA", wrap("<style><![CDATA[.a{fill:url(#g)}]]></style><rect class=\"a\"/>")],
    ["a tiny width", `<svg ${NS} width="10" height="10"><rect width="10" height="10"/></svg>`],
    ["text with the five XML entities", wrap("<text>R&amp;D &lt;3 &quot;x&quot; &apos;y&apos; &gt;</text>")],
    ["gradientUnits objectBoundingBox (not an <object>)", wrap('<linearGradient gradientUnits="objectBoundingBox"/>')],
    ["uppercase SVG root", `<SVG ${NS}><rect/></SVG>`],
    ["comments and whitespace after </svg>", `${wrap("<rect/>")}\n<!-- generated -->\n<!-- by x -->\n`],
    [
      "an Illustrator-style export",
      `<?xml version="1.0" encoding="UTF-8"?>\n<svg id="Livello_1" data-name="Livello 1" ${NS} viewBox="0 0 200 50">\n  <defs><style>.cls-1{fill:#1d1d1b;}</style></defs>\n  <path class="cls-1" d="M0 0h200v50H0z"/>\n</svg>\n`,
    ],
    [
      "an Illustrator export with the standard SVG 1.1 DOCTYPE",
      `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg version="1.1" id="Livello_1" ${NS} ${XLINK} x="0px" y="0px"\n\t viewBox="0 0 200 50" style="enable-background:new 0 0 200 50;" xml:space="preserve">\n<style type="text/css">\n\t.st0{fill:#1D1D1B;}\n</style>\n<path class="st0" d="M0,0h200v50H0V0z"/>\n</svg>\n`,
    ],
    [
      "the standard SVG 1.0 DOCTYPE",
      `<!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.0//EN' 'http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd'>${wrap("<rect/>")}`,
    ],
    ["an embedded base64 PNG in <image href>", wrap('<image width="10" height="10" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="/>')],
    ["an embedded JPEG in <image xlink:href> with wrapped base64", wrap('<image xlink:href="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ\n\t\tAAAQABAAD/2wBDAAgGBgcGBQgH\n BwcJCQgKDBQNDAsLDBkSEw8U"/>')],
    ["an embedded WebP, uppercase DATA and a prefixed image tag", wrap('<svg:image href="DATA:IMAGE/WEBP;BASE64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="/>')],
    [
      "an Inkscape-style export",
      `<svg ${NS} xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" sodipodi:docname="logo.svg" inkscape:version="1.3"><sodipodi:namedview id="n" pagecolor="#ffffff"/><g inkscape:label="Layer 1" inkscape:groupmode="layer"><path d="M0 0z" style="fill:#000;stroke:none"/></g></svg>`,
    ],
  ])("accepts %s", (_label, text) => {
    expect(isSafeSvg(text)).toBe(true);
    expect(isSafeSvgBytes(utf8(text))).toBe(true);
  });
});

describe("isSafeSvg: refused", () => {
  it.each([
    // Matrix: script
    ["a script element", wrap("<script>alert(1)</script>")],
    ["an uppercase script element", wrap("<SCRIPT>alert(1)</SCRIPT>")],
    ["a namespaced script element", wrap('<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>')],
    ["whitespace inside the script tag", wrap("< script >alert(1)</script>")],
    ["a newline inside the script tag", wrap("<scr\nipt>alert(1)</script>")],
    ["foreignObject", wrap("<foreignObject><div/></foreignObject>")],
    ["iframe", wrap('<iframe src="x"/>')],
    ["embed", wrap('<embed src="x"/>')],
    ["object", wrap('<object data="x"/>')],
    // Matrix: event handler
    ["onload on the root", `<svg ${NS} onload="alert(1)"><rect/></svg>`],
    ["ONclick on a rect", wrap("<rect ONclick=alert(1) />")],
    ["an event handler after a quote", wrap('<rect x="1"onclick="alert(1)"/>')],
    ["an event handler with spaces around =", wrap('<rect onmouseover \n = "alert(1)"/>')],
    ["a prefixed event handler", wrap('<rect ev:onclick="alert(1)"/>')],
    // Matrix: external ref
    ["an external image href", wrap('<image href="https://evil.example/x.png"/>')],
    ["a data: xlink:href", wrap('<image xlink:href="data:image/gif;base64,AAAA"/>')],
    ["an xlink:href with spaces to an external file", wrap('<use xlink:href = " https://evil.example/a.svg#x" />')],
    ["an unquoted href", wrap("<use href=https://evil.example/x/>")],
    ["an empty href", wrap('<use href=""/>')],
    ["an external url()", wrap('<rect fill="url(https://evil.example/x)"/>')],
    ["a quoted external url() in a style block", wrap("<style>.a{fill:url('//evil.example/x')}</style>")],
    ["@import", wrap("<style>@import 'https://evil.example/x.css';</style>")],
    ["an @import split by whitespace", wrap("<style>@\nimport 'x.css';</style>")],
    ["a CSS escape", wrap("<style>.a{fill:\\75rl(https://evil.example/x)}</style>")],
    ["an animation setting href", wrap('<a href="#a"><set attributeName="href" to="https://evil.example"/></a>')],
    ["an xml-stylesheet instruction", `<?xml version="1.0"?><?xml-stylesheet href="https://evil.example/x.css"?>${wrap("<rect/>")}`],
    ["javascript: in an href", wrap('<a href="javascript:alert(1)"><rect/></a>')],
    ["javascript: anywhere", wrap('<rect class="javascript:x"/>')],
    // Matrix: obfuscated
    ["a script split by a comment", wrap("<scr<!-- -->ipt>alert(1)</script>")],
    ["entity-encoded javascript:", wrap('<a href="&#106;avascript:alert(1)"><rect/></a>')],
    ["hex entity-encoded javascript:", wrap('<a href="#x" class="&#x6A;&#x61;vascript:"/>')],
    ["entities and tabs splitting javascript:", wrap('<a href="#x" class="java&#x09;script&#58;x"/>')],
    ["double-encoded javascript:", wrap('<a href="#x" class="&amp;#106;avascript:x"/>')],
    ["an entity-encoded url(", wrap('<rect fill="&#117;rl(https://evil.example/x)"/>')],
    ["an entity-encoded external href", wrap('<use href="&#104;ttps://evil.example/x"/>')],
    ["a comment splitting an event handler", wrap('<rect on<!-- x -->click="alert(1)"/>')],
    ["nested comments hiding a script", wrap("<!-- <!-- --> <script>alert(1)</script> -->")],
    ["an unclosed comment", wrap("<!-- <rect/>")],
    ["a named entity other than the XML five", wrap("<text>&nbsp;</text>")],
    ["an xml-stylesheet instruction with an internal href, alone", `<?xml-stylesheet type="text/xsl" href="#x"?>${wrap("<rect/>")}`],
    ["image-set( with a bare string", wrap("<style>.a{background:image-set('https://evil.example/x.png' 1x)}</style>")],
    ["-webkit-image-set( with a bare string", wrap('<rect style="fill:-webkit-image-set(&quot;//evil.example/x&quot; 1x)"/>')],
    ["cross-fade( with a bare string", wrap("<style>.a{fill:cross-fade('a.png', 'b.png', 50%)}</style>")],
    ["src( with a bare string", wrap("<style>@font-face{font-family:x;src('https://evil.example/f.woff')}</style>")],
    ["an entity-encoded image-set(", wrap('<rect style="fill:&#105;mage-set(\'x.png\' 1x)"/>')],
    ["image-set ( split by whitespace", wrap("<style>.a{fill:image-set\n('x.png' 1x)}</style>")],
    ["a script after </svg> between comments", `${wrap("<rect/>")}<!-- a --><script>alert(1)</script><!-- b -->`],
    // Embedded data that is not a raster image
    ["an embedded SVG data URI", wrap('<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/>')],
    ["a plain svg+xml data URI", wrap('<image href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"/>')],
    ["an uppercase SVG data URI", wrap('<image href="DATA:IMAGE/SVG+XML;BASE64,PHN2Zz48L3N2Zz4="/>')],
    ["an HTML data URI", wrap('<image xlink:href="data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4="/>')],
    ["an entity-encoded SVG data URI", wrap('<image href="&#100;ata:image/svg&#43;xml;base64,PHN2Zz48L3N2Zz4="/>')],
    ["an entity-encoded HTML data URI", wrap('<image href="data:&#116;ext/html;base64,PHA+"/>')],
    ["a PNG data URI that is not base64", wrap('<image href="data:image/png,abc"/>')],
    ["a PNG data URI with non-base64 characters", wrap('<image href="data:image/png;base64,iVBOR(x)"/>')],
    ["a PNG data URI on <use>", wrap('<use href="data:image/png;base64,iVBORw0KGgo="/>')],
    ["a PNG data URI on a feImage", wrap('<feImage href="data:image/png;base64,iVBORw0KGgo="/>')],
    ["a PNG data URI in url()", wrap('<rect fill="url(data:image/png;base64,iVBORw0KGgo=)"/>')],
    ["an <image> with an external href", wrap('<image href="https://evil.example/x.png"/>')],
    ["an embedded PNG next to an event handler", wrap('<image onload="x" href="data:image/png;base64,iVBORw0KGgo="/>')],
    // DOCTYPE / ENTITY
    ["a standard DOCTYPE with an internal subset", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [ <!ENTITY x "y"> ]>${wrap("<rect/>")}`],
    ["a DOCTYPE with only a subset", `<!DOCTYPE svg [ <!ENTITY ns_svg "http://www.w3.org/2000/svg"> ]>${wrap("<rect/>")}`],
    ["a DOCTYPE with another public id", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.2//EN" "http://www.w3.org/x.dtd">${wrap("<rect/>")}`],
    ["a DOCTYPE with a non-w3.org system id", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://evil.example/svg11.dtd">${wrap("<rect/>")}`],
    ["a second standard DOCTYPE", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/a.dtd"><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/a.dtd">${wrap("<rect/>")}`],
    ["a standard DOCTYPE inside the root", wrap('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/a.dtd"><rect/>')],
    ["an HTML DOCTYPE", `<?xml version="1.0"?><!DOCTYPE html>${wrap("<rect/>")}`],
    ["an ENTITY inside the root", wrap('<!ENTITY x "y"><rect/>')],
    ["a lowercase doctype", `<!doctype svg>${wrap("<rect/>")}`],
    // Matrix: not SVG
    ["an HTML document", "<!doctype html><html><body><svg></svg></body></html>"],
    ["an HTML root", "<html><svg></svg></html>"],
    ["text after the closing tag", `${wrap("<rect/>")}<script>alert(1)</script>`],
    ["no closing svg tag", `<svg ${NS}><rect/>`],
    ["a root that only starts with svg", `<svgx ${NS}></svgx></svg>`],
    ["an empty text", ""],
    ["a NUL character", wrap("<rect/>\u0000")],
  ])("refuses %s", (_label, text) => {
    expect(isSafeSvg(text)).toBe(false);
    expect(isSafeSvgBytes(utf8(text))).toBe(false);
  });
});

describe("scanSvg verdicts", () => {
  it.each([
    ["ok", wrap("<rect/>")],
    ["invalid", "<html><body>x</body></html>"],
    ["invalid", `<svg ${NS}><rect/>`],
    ["invalid", ""],
    ["invalid", wrap("<rect/>\u0000")],
    ["invalid", `${wrap("<rect/>")}<script>alert(1)</script>`],
    ["unsafe", wrap("<script>alert(1)</script>")],
    ["unsafe", `<?xml-stylesheet type="text/xsl" href="#x"?>${wrap("<rect/>")}`],
    ["unsafe", `<!DOCTYPE svg [ <!ENTITY x "y"> ]>${wrap("<rect/>")}`],
    ["unsafe", wrap('<image href="https://evil.example/x.png"/>')],
  ] as const)("answers %s for %j", (verdict, text) => {
    expect(scanSvg(text)).toBe(verdict);
  });

  it("answers invalid for bytes that are not UTF-8", () => {
    expect(scanSvgBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("invalid");
    expect(scanSvgBytes(new TextEncoder().encode(wrap("<rect/>")))).toBe("ok");
  });
});

describe("isSafeSvgBytes", () => {
  it("refuses bytes that are not valid UTF-8 (a PNG renamed .svg)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(decodeUtf8(png)).toBeNull();
    expect(isSafeSvgBytes(png)).toBe(false);
  });

  it("refuses a clean SVG with one invalid UTF-8 byte", () => {
    const bytes = utf8(wrap("<text>x</text>"));
    bytes[bytes.length - 12] = 0xff;
    expect(isSafeSvgBytes(bytes)).toBe(false);
  });

  it("decodes valid UTF-8, dropping a BOM", () => {
    expect(decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa8]))).toBe("aè");
  });
});

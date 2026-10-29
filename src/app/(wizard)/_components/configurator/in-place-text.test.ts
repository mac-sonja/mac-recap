// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { typedText } from "./in-place-text";

const node = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("typedText", () => {
  it("keeps the words as typed, whatever CSS shows (an Etichetta's capitals are not saved)", () => {
    const el = node("Progetto");
    el.style.textTransform = "uppercase";
    expect(typedText(el)).toBe("Progetto");
  });

  it.each([
    ["a newline typed as text", "riga uno\nriga due", "riga uno\nriga due"],
    ["a <br>", "riga uno<br>riga due", "riga uno\nriga due"],
    ["lines wrapped in <div>", "riga uno<div>riga due</div><div>riga tre</div>", "riga uno\nriga due\nriga tre"],
    ["an empty line as <div><br></div>", "uno<div><br></div><div>tre</div>", "uno\n\ntre"],
    ["the browser's last placeholder <br>", "riga uno<br>riga due<br>", "riga uno\nriga due"],
    ["an emptied text holding only the placeholder", "<br>", ""],
  ])("reads %s as line breaks", (_name, html, expected) => {
    expect(typedText(node(html))).toBe(expected);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditClientButton } from "./edit-client-button";

const ID = "cccccccc-0000-4000-8000-000000000001";

describe("EditClientButton", () => {
  it("links Modifica cliente to the client wizard at step 1 and hides it below 1024 px", () => {
    const html = renderToStaticMarkup(<EditClientButton clientId={ID} />);
    expect(html).toMatch(new RegExp(`^<a [^>]*href="/clients/new\\?clientId=${ID}&amp;step=1"`));
    expect(html).toContain("hidden");
    expect(html).toContain("lg:inline-flex");
    expect(html).toContain("Modifica cliente</a>");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { it as dict } from "@/shared/i18n/it";
import { EditClientButton } from "./edit-client-button";

const ID = "cccccccc-0000-4000-8000-000000000001";

describe("EditClientButton", () => {
  it("links Modifica to the client wizard at step 1 and hides it below 1024 px", () => {
    const html = renderToStaticMarkup(<EditClientButton clientId={ID} />);
    expect(html).toMatch(new RegExp(`^<a [^>]*href="/clients/new\\?clientId=${ID}&amp;step=1"`));
    // The shared secondary button style; `cn` drops its `inline-flex` for `hidden`.
    const classes = html.match(/^<a [^>]*class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["hidden", "lg:inline-flex", "rounded-full", "bg-surface-raised"]));
    expect(html).toContain(`${dict.clients.edit}</a>`);
  });
});

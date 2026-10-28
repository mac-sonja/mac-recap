import { describe, expect, it } from "vitest";
import { authMessage, signInNotice } from "./messages";

describe("authMessage", () => {
  it("names the company domain when another one is used", () => {
    expect(authMessage("EMAIL_DOMAIN_NOT_ALLOWED")).toContain("@menatcode.it");
  });

  it("gives one message for wrong email or password, never which one", () => {
    expect(authMessage("INVALID_CREDENTIALS")).toBe("Email o password non corrette. Riprova.");
  });

  it("falls back to the generic message", () => {
    expect(authMessage("SOMETHING_ELSE")).toBe(authMessage("AUTH_FAILED"));
  });
});

describe("signInNotice", () => {
  it("knows only its own keys", () => {
    expect(signInNotice("inattivo")).toContain("non è attivo");
    expect(signInNotice("toString")).toBeNull();
    expect(signInNotice(undefined)).toBeNull();
  });
});

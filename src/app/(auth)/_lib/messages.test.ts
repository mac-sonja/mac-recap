import { describe, expect, it } from "vitest";
import { authMessage, signInNotice, signUpFieldsMessage } from "./messages";

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

describe("signUpFieldsMessage", () => {
  it("names the fields to fix, in form order", () => {
    expect(signUpFieldsMessage(["password", "team"])).toBe("Da completare: Cosa fai in MAC, Password.");
  });

  it("falls back to the generic line", () => {
    expect(signUpFieldsMessage(undefined)).toBe("Controlla i campi evidenziati.");
  });
});

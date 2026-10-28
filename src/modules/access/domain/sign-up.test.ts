import { describe, expect, it } from "vitest";
import { isSignUpDomain, profileFromSignUp, signUpInputSchema, signUpMetadata } from "./sign-up";

const valid = {
  firstName: " Anna ",
  lastName: "Rossi",
  email: " Anna.Rossi@MenAtCode.it ",
  team: "account",
  password: "una-password",
};

describe("isSignUpDomain", () => {
  it.each([
    ["anna@menatcode.it", true],
    ["ANNA@MENATCODE.IT", true],
    ["anna@gmail.com", false],
    ["anna@sub.menatcode.it", false],
    ["anna@menatcode.it.evil.com", false],
    ["anna@notmenatcode.it", false],
  ])("%s → %s", (email, expected) => {
    expect(isSignUpDomain(email)).toBe(expected);
  });
});

describe("signUpInputSchema", () => {
  it("normalizes the email", () => {
    const parsed = signUpInputSchema.parse(valid);
    expect(parsed.email).toBe("anna.rossi@menatcode.it");
  });

  it("refuses another domain with the DOMAIN message", () => {
    const parsed = signUpInputSchema.safeParse({ ...valid, email: "anna@gmail.com" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain("DOMAIN");
  });

  it("asks for the job title after Altro", () => {
    expect(signUpInputSchema.safeParse({ ...valid, team: "altro" }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...valid, team: "altro", otherTitle: " " }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...valid, team: "altro", otherTitle: "Video editor" }).success).toBe(true);
  });

  it("needs both first and last name", () => {
    expect(signUpInputSchema.safeParse({ ...valid, firstName: " " }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...valid, lastName: "" }).success).toBe(false);
  });

  it("refuses short passwords and unknown teams", () => {
    expect(signUpInputSchema.safeParse({ ...valid, password: "corta" }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...valid, team: "admin" }).success).toBe(false);
  });
});

describe("profileFromSignUp", () => {
  const now = new Date("2026-10-28T09:00:00Z");

  it.each([
    ["designer", undefined, "Designer", "2026-10-28T09:00:00.000Z"],
    ["account", undefined, "Account", null],
    ["commerciale", undefined, "Commerciale", null],
    ["altro", "Video editor", "Video editor", null],
  ] as const)("%s starts as account/sales/social", (team, otherTitle, jobTitle, requested) => {
    const input = signUpInputSchema.parse({ ...valid, team, otherTitle });
    const profile = profileFromSignUp("Anna@menatcode.it", signUpMetadata(input), now);
    expect(profile).toEqual({
      email: "anna@menatcode.it",
      displayName: "Anna Rossi",
      role: "account_sales_social",
      jobTitle,
      designerRequestedAt: requested,
    });
  });
});

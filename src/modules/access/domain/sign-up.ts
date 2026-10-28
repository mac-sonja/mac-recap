import { z } from "zod";
import type { Role } from "./actor";

/**
 * Open sign-up (owner, 2026-10-28): only addresses on this domain may sign up on
 * their own; anyone else is added by an admin and sets a password from the invite.
 */
export const SIGN_UP_DOMAIN = "menatcode.it";

/** Minimum password length, for sign-up and for setting a new password. */
export const MIN_PASSWORD_LENGTH = 8;

/** The team menu at sign-up. `altro` asks for the job title in a text field. */
export const TEAMS = ["designer", "account", "commerciale", "altro"] as const;
export type Team = (typeof TEAMS)[number];

/** Job titles stored for the fixed menu entries; `altro` stores what was typed. */
const TEAM_TITLES: Readonly<Record<Exclude<Team, "altro">, string>> = {
  designer: "Designer",
  account: "Account",
  commerciale: "Commerciale",
};

/** Lower-cased, trimmed email: how sessions and profiles are matched. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when `email` is on the sign-up domain (exactly, not a subdomain). */
export function isSignUpDomain(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${SIGN_UP_DOMAIN}`);
}

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(72);

/** What the sign-up form sends. Field names match the form's inputs. */
export const signUpInputSchema = z
  .object({
    firstName: z.string().trim().min(1).max(40),
    lastName: z.string().trim().min(1).max(40),
    email: z.string().trim().toLowerCase().pipe(z.email()).refine(isSignUpDomain, { message: "DOMAIN" }),
    team: z.enum(TEAMS),
    otherTitle: z.string().trim().max(40).optional(),
    password: passwordSchema,
  })
  .refine((v) => v.team !== "altro" || (v.otherTitle !== undefined && v.otherTitle.length >= 2), {
    path: ["otherTitle"],
  });
export type SignUpInput = z.infer<typeof signUpInputSchema>;

/**
 * Kept on the auth user at sign-up and read back once the email is confirmed,
 * when the profile is created. It never carries a role.
 */
export const signUpMetadataSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  job_title: z.string().trim().min(1).max(60),
  designer_requested: z.boolean(),
});
export type SignUpMetadata = z.infer<typeof signUpMetadataSchema>;

export function signUpMetadata(input: SignUpInput): SignUpMetadata {
  const job_title = input.team === "altro" ? (input.otherTitle ?? "") : TEAM_TITLES[input.team];
  const display_name = `${input.firstName} ${input.lastName}`;
  return { display_name, job_title, designer_requested: input.team === "designer" };
}

/** A profile to create for a confirmed self-sign-up. */
export interface NewProfile {
  email: string;
  displayName: string;
  role: Exclude<Role, "system">;
  jobTitle: string | null;
  designerRequestedAt: string | null;
}

/**
 * Everyone who signs up on their own starts as account/sales/social: a designer
 * reads approved cases until an admin grants owner/designer (owner, 2026-10-28).
 */
export function profileFromSignUp(email: string, metadata: SignUpMetadata, now: Date): NewProfile {
  return {
    email: normalizeEmail(email),
    displayName: metadata.display_name,
    role: "account_sales_social",
    jobTitle: metadata.job_title,
    designerRequestedAt: metadata.designer_requested ? now.toISOString() : null,
  };
}

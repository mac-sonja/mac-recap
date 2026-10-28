# Sign-in setup (Story 6.1)

How people get in (owner decision, 2026-10-28):

- Anyone with an `@menatcode.it` address signs up on `/sign-up`: name, what they
  do (Designer, Account, Commerciale, or Altro with their own words) and a
  password. They confirm the address from an email, then they're in.
- Everyone who signs up starts with the **Editor** permissions (account/sales/social:
  read, download and share approved cases). Designers are flagged as waiting; an
  admin grants them **Owner** (owner/designer) from **Organizzazione** (Story 6.3).
- Anyone else (no company address) is added by an admin and sets a password
  from the invite email (Story 6.3).
- The role is always read from `profile` on each request; nothing in the session
  or the sign-up form grants one.

## Supabase Auth settings, per hosted project

Local (`supabase start`) takes these from `supabase/config.toml`. For each hosted
project (mac-recap-dev, staging, prod), set them in the Supabase dashboard:

1. **Authentication → Sign In / Providers → Email**: email provider on,
   **Confirm email** on, minimum password length 8. **Allow new users to sign
   up** stays on (the app accepts only the company domain; a sign-up made
   around the app gets no profile, so it can't do anything).
2. **Authentication → URL Configuration**: **Site URL** = the environment's
   address (for example `https://recap-staging.example`). Add
   `<site>/auth/confirm` to **Redirect URLs**.
3. **Authentication → Emails → Templates**: paste the bodies of
   `supabase/templates/confirmation.html` (Confirm signup),
   `invite.html` (Invite user) and `recovery.html` (Reset password), with the
   subjects from `supabase/config.toml`. Their links go to
   `/auth/confirm?token_hash=…&type=…`, which works on any device.
4. **Authentication → Emails → SMTP**: the built-in sender allows only a few
   emails per hour and is meant for testing. Before real people use it, set a
   custom SMTP sender.

## The first admin (one-off, per environment)

No screen can create an admin without an existing admin (Story 6.3). After
migrations `20261028120000` and `20261028140000` are applied:

1. The future admin signs up on `/sign-up` with their `@menatcode.it` address
   and confirms the email (they land on the library as account/sales/social).
2. In the Supabase dashboard → **SQL Editor** of that project, run, with their
   address:

   ```sql
   update public.profile
     set role = 'admin', designer_requested_at = null
     where lower(email) = lower('nome.cognome@menatcode.it');
   ```

   It must report `UPDATE 1`. At their next page load they land on the Dashboard,
   with **Organizzazione** in the sidebar under Clienti.
3. From then on, admins add people, change their Permessi and Ruolo, approve
   designers and remove users from **Organizzazione** (`/organization`). The database refuses to remove or demote the last
   enabled admin, and only the seeded system profile can hold the `system` role.

An admin sees and does everything an Owner does, plus **Organizzazione**
(owner, 2026-10-28). No role, admin included, can change the permission matrix or
a guardrail.

Labels in the UI (owner, 2026-10-28): the fixed role is called **Permessi**, with
Owner (`owner_designer`), Editor (`account_sales_social`) and Amministratore
(`admin`). **Ruolo** is free text for what the person does; it grants nothing.

## Cutover

The migration `20261028120000_access_sign_in.sql` disables the seeded dev
owner/designer (it keeps every record it made). From then on, every page needs a
real session: sign up first, then follow the one-off step for the first admin
(Story 6.3) to give someone the admin role.

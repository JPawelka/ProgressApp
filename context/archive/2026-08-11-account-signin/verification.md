# Verification: account-signin (S-01 / FR-001)

Repeatable local smoke for account create + sign-in + protected access.
Fill the checklist at the bottom when running Phase 2.

**Out of scope for this change:** production Worker full-login smoke; email-link confirmation / `emailRedirectTo` callback (local path uses confirmations off).

## Prerequisites

1. Local Supabase running: `npx supabase start`
2. Email confirmations off — local default in `supabase/config.toml` (`enable_confirmations = false`). For a hosted project used like local, toggle confirmation off per README.
3. Env configured for local API: `.env` and/or `.dev.vars` with `SUPABASE_URL` + anon `SUPABASE_KEY` (see `.env.example`)
4. App running: `npm run dev`

Studio: http://127.0.0.1:54323  
API: http://127.0.0.1:54321  

## Steps

1. Open `/auth/signup`, create a new user (unique email + password).
2. Expect redirect to `/auth/confirm-email` (or equivalent). Under confirmations-off you may already have a session; still continue to sign-in for FR-001.
3. Open `/auth/signin`, sign in with that email/password.
4. Expect redirect (today to `/`). Then open `/dashboard` or `/plans` — authenticated shell (e.g. email visible).
5. Sign out (dashboard/sign-out control).
6. While signed out, open `/dashboard` — expect redirect to `/auth/signin`.

---

## Pass / fail checklist

| # | Check | Pass? (Y/N) | Notes |
|---|--------|-------------|-------|
| 2.2 | Sign-up completes under local confirmations-off (confirm-email page or immediate session) | Y | |
| 2.3 | Sign-in succeeds for that user | Y | |
| 2.4 | Signed-in access to `/dashboard` or `/plans` works | Y | |
| 2.5 | Anonymous `/dashboard` redirects to `/auth/signin` | Y | Also curl 302 on :4322 |

**Phase 2 complete only when all rows are Y.**

### Notes (environment quirks)

- App on `http://localhost:4322`; `.env` / `.dev.vars` pointed at hosted Supabase with confirmations off (local Supabase also running).
-
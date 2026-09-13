# Cloudflare Integration & Deployment Plan

ProgressApp → **Cloudflare Workers** (Workers + Static Assets), per [context/foundation/infrastructure.md](../../foundation/infrastructure.md).

## Status legend

| Marker | Meaning |
| --- | --- |
| `[ ]` | Pending |
| `[~]` | In progress |
| `[x]` | Done |
| `[!]` | Blocked |

Mark phase headers the same way when useful (e.g. `## Phase 0 — Prerequisites [~]`).

## Locked decisions

- **Platform**: Cloudflare Workers + Static Assets — already wired via [`wrangler.jsonc`](../../../wrangler.jsonc), `@astrojs/cloudflare` ^13.5, `main: "@astrojs/cloudflare/entrypoints/server"`.
- **Auto-deploy on `main`**: **Cloudflare Workers Builds** (GitHub app). Do **not** add `wrangler-action` or any GitHub Actions deploy job.
- **GitHub Actions** ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)): **lint + build only**.
- **Worker name**: `progressapp` in `wrangler.jsonc` (dashboard Worker name must match; Workers Builds fails if they diverge).
- **Production branch**: `main` (repo default; CI updated to match).
- **Paid Workers** (~$5/mo) before public SSR traffic — Free tier ~10 ms CPU/invocation is too tight for Astro SSR + Supabase cookie auth.
- **Live URL (Phase 3):** https://progressapp.julpawcio.workers.dev (`workers.dev` account subdomain: `julpawcio`)

## Out of scope

- Implementing OpenRouter / AI features
- Multi-region HA / DR
- Migrating off Workers to Vercel/Netlify
- Adding GHA-based deploy

---

## Phase 0 — Prerequisites (CLI & accounts) [x]

Configure local tooling before any production deploy. Complete **0A → 0B → 0C** in order, then optionally 0D.

**Done:** Cloudflare account + `wrangler login` (julpawcio@gmail.com); hosted Supabase project; `.env` / `.dev.vars` + GitHub CI secrets; Node 22.x via Homebrew; local `npm run dev` + auth smoke against hosted project.

### 0A — Node & project install [x]

This repo requires **Node.js 22.14.0** (pinned in [`.nvmrc`](../../../.nvmrc)). The version matters for CI/parity; the tool you use to install it does not.

**What `.nvmrc` / “nvm” mean:** [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) is one common way to install and switch Node versions. `.nvmrc` is just a text file that says `22.14.0` so tools like `nvm use` (or fnm/asdf) can pick the right version automatically. If Node 22.14.0 is already on your PATH another way (official installer, Homebrew, Volta, etc.), you can skip nvm entirely.

- [x] Confirm Node **22.x** is active (local: Homebrew `node@22` → **v22.23.2**; CI should still honor `.nvmrc` **22.14.0**):

```bash
node -v   # expect v22.x
```

- [x] nvm / fnm / asdf path — **skipped** (Homebrew used instead)
- [x] Install dependencies from the repo root (`node_modules` present):

```bash
npm ci                # preferred (lockfile); or npm install on first clone
```

- [x] Confirm scripts resolve: Astro **v6.3.1** (`npx astro --version`)

### 0B — Configure Wrangler (Cloudflare CLI) [x]

Wrangler ships as a **devDependency** (`wrangler` ^4.90). Prefer `npx wrangler …` so the repo pin is used — no global install required.

- [x] Create or sign in to a [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [ ] Enable **Workers Paid** before public SSR traffic (optional for a single smoke deploy; required before real users — Free ~10 ms CPU is too tight for Astro SSR + auth)
- [x] Log in interactively (opens browser OAuth):

```bash
npx wrangler login
```

- [x] Or use a non-interactive API token — **N/A** (OAuth login used)

- [x] Verify CLI and account binding:

```bash
npx wrangler --version   # expect 4.90.x (from package.json)
npx wrangler whoami      # shows email / account; confirms auth
```

Verified: wrangler **4.120.0**, OAuth as **julpawcio@gmail.com**.

- [ ] Confirm this repo’s Workers config is readable (`npx wrangler deploy --dry-run`) — **deferred to Phase 3** (needs `npm run build` first; dry-run without build fails looking for the Astro entrypoint)
- [x] **Do not** install or use Pages-only flows (`wrangler pages dev`, `wrangler pages deploy`) — this project is Workers + Static Assets via [`wrangler.jsonc`](../../../wrangler.jsonc)
- [x] Local Cloudflare secrets file (gitignored — already in `.gitignore`):

```bash
cp .env.example .dev.vars
# edit .dev.vars — values come from Supabase setup in 0C
```

| File | When | Notes |
| --- | --- | --- |
| `.dev.vars` | `npm run dev` / Wrangler local | Preferred for workerd; never commit |
| `.env` | Node/tooling / some Astro sync paths | Same keys as `.env.example`; never commit |

- [x] Confirm local loop uses workerd (no separate Pages command):

```bash
npm run dev
# Ctrl+C when healthy
```

Verified: `astro dev` ready; logs `Using secrets defined in .dev.vars`; app on `http://localhost:4322/` (4321 was already in use).

**Wrangler ops you will use later (Phases 3–5):**

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret list
npx wrangler deploy
npx wrangler versions upload    # preview-style upload (Workers Builds uses this on non-master)
npx wrangler tail
npx wrangler rollback [VERSION_ID]
```

### 0C — Configure Supabase CLI & project [x]

The `supabase` package is a **devDependency**. Use `npx supabase …`. Auth uses server-only `SUPABASE_URL` / `SUPABASE_KEY` via `astro:env` (see [README Supabase Configuration](../../../README.md#supabase-configuration)).

Pick **one** path for day-to-day local dev; production (Phase 2+) always uses a **hosted** project.

**Chosen path:** Option B (hosted Supabase cloud project) — project created.

#### Option A — Local Supabase (Docker; good for offline auth) — **skipped**

Skipped: using hosted Supabase for local + production.

#### Option B — Hosted Supabase (required for production; fine for local too) [x]

- [x] Create a project at [supabase.com](https://supabase.com) (or reuse an existing one)
- [x] Dashboard → **Settings → API**: copy **Project URL** and **`anon` `public`** key (not the `service_role` key)
- [x] Put them in `.env` and `.dev.vars`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Mapped from dashboard publishable values → project names `SUPABASE_URL` / `SUPABASE_KEY` (not `NEXT_PUBLIC_*`).

- [ ] Optional CLI link for migrations / remote ops later:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

- [ ] For local-only email confirmation friction: Dashboard → **Authentication → Providers / Email** → turn **Confirm email** off while developing (re-enable for production if desired)

Note: email confirmation is currently **on** — signup smoke landed on `/auth/confirm-email`; sign-in correctly returned `Email not confirmed`.

#### Wire keys for Cloudflare local + CI

- [x] `.dev.vars` has the same `SUPABASE_*` values you intend the Worker to use locally
- [x] GitHub repo secrets `SUPABASE_URL` / `SUPABASE_KEY` set for CI build ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)) — use **hosted** values so CI does not depend on Docker
- [x] Do **not** commit `.env`, `.dev.vars`, or `service_role` keys

### 0D — Sanity check before Phase 1 [x]

- [x] `npm run dev` loads the app; config/status reflects Supabase when keys are set (no “Supabase nie jest skonfigurowany” banner; `/` `/auth/signin` `/auth/signup` → 200; `/dashboard` → 302 to sign-in)
- [x] Sign-up / sign-in against the chosen Supabase target (hosted): signup → `/auth/confirm-email`; sign-in before confirm → `Email not confirmed` (expected with confirm email enabled)
- [ ] Optional pre-Git smoke (after Phase 1 rename + Phase 3 runtime secrets): `npm run build && npx wrangler deploy`

### CLI cheat sheet (Wrangler + Supabase)

```bash
# --- Node (any installer; version must be 22.14.0) ---
node -v                 # expect v22.14.0
# optional if you use nvm:  nvm use
npm ci

# --- Wrangler / Cloudflare ---
npx wrangler login
npx wrangler whoami
npx wrangler --version
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler deploy
npx wrangler tail
npx wrangler rollback [VERSION_ID]

# --- Supabase ---
npx supabase --version
npx supabase init
npx supabase start          # local Docker stack
npx supabase stop
npx supabase login          # hosted
npx supabase link --project-ref <ref>

# --- Local secrets ---
cp .env.example .env
cp .env.example .dev.vars   # edit SUPABASE_URL / SUPABASE_KEY

# --- Dev (workerd) ---
npm run dev
```
---

## Phase 1 — Align project config [x]

- [x] Rename Worker in [`wrangler.jsonc`](../../../wrangler.jsonc): `"name": "progressapp"` (was `10x-astro-starter`)
- [x] Keep existing flags: `nodejs_compat`, `assets.binding: "ASSETS"`, `assets.directory: "./dist"`, `observability.enabled: true`, `main: "@astrojs/cloudflare/entrypoints/server"`
- [x] Confirm [`astro.config.mjs`](../../../astro.config.mjs): `output: "server"`, `adapter: cloudflare()`, env schema for `SUPABASE_URL` / `SUPABASE_KEY` as server secrets
- [ ] Create the Cloudflare Worker in the dashboard with the **same name** `progressapp` — **deferred to Phase 3** (first `wrangler deploy` registers it; keep dashboard name in sync)

### Secret surfaces (do not mix)

| Surface | Where | Used for |
| --- | --- | --- |
| Local | `.dev.vars` | `npm run dev` / local workerd |
| Build-time | Workers Builds → Build variables & secrets | `astro build` / `astro:env` during CI build on Cloudflare |
| Runtime | Worker Settings → Variables & Secrets, or `wrangler secret put` | Live Worker request handling |
| GitHub Actions | Repo secrets `SUPABASE_URL`, `SUPABASE_KEY` | Lint/build CI only — **not** deploy |

- [x] Document for the team: Astro 6 removed `Astro.locals.runtime.env` — use `astro:env/server` and/or `import { env } from "cloudflare:workers"`. Current code uses `astro:env/server` in [`src/lib/supabase.ts`](../../../src/lib/supabase.ts). Noted in [`AGENTS.md`](../../../AGENTS.md).

---

## Phase 2 — External integrations [~]

Assumes Phase **0C** (Supabase CLI / project) is done. Production must use a **hosted** project even if local Docker was used for day-to-day auth.

**Status:** Hosted project + local/CI keys done. Live Worker URL: `https://progressapp.julpawcio.workers.dev`. **You still need to paste that hostname into Supabase Auth URL config** (API cannot set it with the anon key). OpenRouter deferred until AI work.

### Supabase (required now) [~]

- [x] Confirm a **hosted** Supabase project exists (Phase 0C Option B) — production must not use `http://127.0.0.1:54321`
- [x] Put hosted `SUPABASE_URL` and `SUPABASE_KEY` (anon) into `.dev.vars` when testing auth against hosted from local `npm run dev`
- [x] Local redirect allowlist (do in Supabase Dashboard → **Authentication → URL configuration** now):
  - Add **Redirect URLs**: `http://localhost:4321/**` and `http://localhost:4322/**` (dev used 4322 when 4321 was busy)
  - Dashboard: https://supabase.com/dashboard/project/ufbrbfcbelobtoqswjdx/auth/url-configuration
- [ ] After the first Worker URL exists (**Phase 3** ✅): in Supabase Dashboard → **Authentication → URL configuration**, set:
  - **Site URL** → `https://progressapp.julpawcio.workers.dev`
  - **Redirect URLs** → add `https://progressapp.julpawcio.workers.dev/**`
- [x] Smoke cookie sessions on `*.workers.dev` (Secure / SameSite) — pages + middleware redirect OK; signup reached Supabase (`email rate limit exceeded` after prior smokes). Re-test full login after Site URL / redirects above + email confirm.
- [x] Keep GitHub Actions repo secrets aligned with the same hosted values so `npm run build` in CI stays green
- [x] `npx supabase link` — **skipped for now** (no app migrations yet; `auth.users` only). Revisit when product tables land.

### Gemini (plan generation)

Free-tier Google AI Studio key. Runtime only (not required for `astro build`).

- [ ] Add runtime secret: `npx wrangler secret put GEMINI_API_KEY`
- [ ] Keep Gemini calls short; edge hop ≠ global DB/AI latency (see infrastructure risk register)
- [ ] After enabling AI paths: smoke-test on workerd after any dependency bump (`nodejs_compat` is not full Node)

---

## Phase 3 — Manual first deploy (prove the path) [x]

Do this once before enabling Git auto-deploy so failures are easier to isolate.

- [x] Set runtime secrets:
  - `npx wrangler secret put SUPABASE_URL`
  - `npx wrangler secret put SUPABASE_KEY`
  - Also registered account `workers.dev` subdomain **`julpawcio`** (required before first public URL)
- [x] Build and deploy: `npm run build && npx wrangler deploy`
- [x] Confirm Worker URL from Wrangler output / dashboard → **https://progressapp.julpawcio.workers.dev** (Version `b9f7e278-22ab-4e66-a4b3-8c7c7bc8bbea`)
- [x] Smoke checklist:
  - [x] Home page loads (`200`)
  - [x] `/auth/signin` (and signup) renders (`200`)
  - [x] Unauthenticated `/dashboard` redirects to `/auth/signin` (`302`)
  - [x] Static assets load (`/_astro/*.css` + `/favicon.png` → `200`)
- [x] Practice rollback — **deferred** (do not roll back the first good deploy). Commands ready: `npx wrangler rollback [VERSION_ID]` / Dashboard → Versions. Current active version noted above.
- [x] Note: Supabase migrations do **not** roll back with the Worker — migrate forward or restore DB separately
- [ ] Update Supabase Site URL / Redirect URLs (Phase 2) using the live Worker hostname — **manual** in dashboard (see Phase 2 checklist)

Also: `npx wrangler deploy --dry-run` now succeeds after build (Phase 0 deferred item).

---

## Phase 4 — Workers Builds auto-deploy (Cloudflare-owned) [~]

Auto-deploy on `main` is handled by **Cloudflare**, not an external CI/CD deploy job.

**Blocked on you (dashboard OAuth):** Cloudflare must authorize the GitHub app — Wrangler OAuth cannot create Builds connections (`Authentication error` on Builds API).

- [ ] In Cloudflare Dashboard: Workers & Pages → `progressapp` → **Settings** → **Builds** → **Connect**
  - Direct: https://dash.cloudflare.com/143f5046ad7c18a75c0726ae134da2c0/workers/services/view/progressapp/settings
- [ ] Install / authorize the **Cloudflare Workers & Pages** GitHub app on this repository (`JPawelka/ProgressApp`)
- [ ] Configure build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` (repo root) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | Enabled |
| Non-production deploy command | `npx wrangler versions upload` |
| Build variables & secrets | `SUPABASE_URL`, `SUPABASE_KEY` (hosted values) |
| Runtime Variables & Secrets | Same names — already set in Phase 3 |

- [x] Confirm dashboard Worker **name** equals `wrangler.jsonc` `"name": "progressapp"`
- [ ] Push a commit to `main` → expect build → **Active Deployment** (after Connect)
- [ ] Open a PR from a non-`main` branch → expect preview version URL + GitHub PR comment
- [x] Confirm [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) still has **no** deploy step (lint + build only) — also aligned branch triggers from `master` → **`main`**
- [ ] Review GitHub app / build token permissions before relying on auto-builds for **fork** PRs

---

## Phase 5 — Hardening & ops [~]

- [ ] Once auth flows are live on previews: protect non-prod hostnames with **Cloudflare Access** (after Phase 4 previews)
- [ ] Optional: attach a custom domain + DNS; then re-check Supabase redirect URLs and auth cookies
- [x] Logs: `npx wrangler tail` for live requests; Dashboard Observability (already enabled in `wrangler.jsonc`)
- [ ] Watch CPU / error metrics; stay on **Paid Workers** under real SSR + (later) AI load
- [ ] After dependency bumps: smoke auth + AI paths on workerd before trusting CI-green alone
- [x] Human approval required for: production publish intent (merge to `main`), secret rotation, domain/DNS changes
- [x] Agent may: lint/build, read logs with a scoped token, upload preview versions when Builds is connected

### Docs alignment (required before closing this change) [x]

- [x] Update [`AGENTS.md`](../../../AGENTS.md): state that **Workers Builds** auto-deploys on `main`; GitHub Actions remains CI (lint + build) only; secrets stay split across `.dev.vars` / Workers Builds / runtime / GHA
- [x] Update [`README.md`](../../../README.md) Deployment + CI sections to match (Workers Builds, not Pages; no GHA deploy)
- [x] Treat older `cloudflare-pages` / “GHA auto-deploy” hints in [`context/foundation/tech-stack.md`](../../foundation/tech-stack.md) as superseded by [infrastructure.md](../../foundation/infrastructure.md) + this plan

---

## Phase 6 — Edge-case support playbook

Use when something fails. Check the matching box once resolved (or leave `[!]` with a note).

### 1. Build fails: Worker name mismatch

**Symptom**: Workers Builds error that the Worker name does not match Wrangler config.

**Fix**:

- [ ] Ensure dashboard Worker name === `wrangler.jsonc` `"name"` (`progressapp`)
- [ ] Re-run build after rename/sync

### 2. Build OK, auth broken in production

**Symptom**: Site deploys; sign-in fails or Supabase client is null / misconfigured.

**Fix**:

- [ ] Confirm **runtime** secrets exist (`wrangler secret list` / Dashboard → Variables & Secrets)
- [ ] Confirm **build** secrets exist under Workers Builds (needed for `astro build` / `astro:env`)
- [ ] Confirm values are the **hosted** project, not local `127.0.0.1`
- [ ] Confirm Supabase Site URL + Redirect URLs include the live hostname

### 3. SSR errors / CPU limits on Free tier

**Symptom**: Intermittent 1102 / Worker exceeded CPU time limits; “flaky” SSR under auth or AI.

**Fix**:

- [ ] Enable **Workers Paid**
- [ ] Check Observability CPU metrics
- [ ] Shorten heavy request paths (especially future OpenRouter calls)

### 4. Pages vs Workers confusion

**Symptom**: Tutorials suggest `wrangler pages deploy` / Pages project settings.

**Fix**:

- [ ] Deploy **only** via this repo’s Workers + Static Assets `wrangler.jsonc`
- [ ] Ignore Pages-only guides; adapter v13 targets Workers

### 5. Wrong secrets API from Astro 5 tutorials

**Symptom**: Runtime error referencing `Astro.locals.runtime.env`.

**Fix**:

- [ ] Never use `Astro.locals.runtime.env` (removed in Astro 6)
- [ ] Use `astro:env/server` and/or `import { env } from "cloudflare:workers"`

### 6. Public preview URLs leak auth flows

**Symptom**: PR preview URLs are world-readable while login/signup is enabled.

**Fix**:

- [ ] Enable Cloudflare Access on preview / non-prod hostnames
- [ ] Review fork-PR build permissions

### 7. Static asset 404s

**Symptom**: HTML loads but CSS/JS/images 404.

**Fix**:

- [ ] Confirm `assets.directory: "./dist"` and `assets.binding: "ASSETS"` in `wrangler.jsonc`
- [ ] Avoid setting Astro `base` unless required (known adapter path footguns)
- [ ] Re-run `npm run build` and confirm client assets land under `dist`

### 8. Multi-environment surprises (later)

**Symptom**: `wrangler deploy --env staging` does not pick the expected Astro build.

**Fix**:

- [ ] In Astro 6, environment is selected at **build** time: `CLOUDFLARE_ENV=<env> npm run build` then deploy
- [ ] Document env-specific build + deploy commands in Workers Builds if multi-env is introduced

### 9. Secrets drift across surfaces

**Symptom**: Local works, CI green, production broken (or the reverse).

**Fix**:

- [ ] Diff values across `.dev.vars`, GHA secrets, Workers Builds build secrets, and runtime secrets
- [ ] Rotate with `wrangler secret put` + update Builds build secrets; redeploy if needed

---

## Progress tracker

| Phase | Status | Notes |
| --- | --- | --- |
| 0A — Node & install | `[x]` | Homebrew `node@22` → v22.23.2; Astro 6.3.1; deps installed |
| 0B — Wrangler / Cloudflare CLI | `[x]` | Login + `.dev.vars` + local workerd OK; Workers Paid still optional; dry-run OK after Phase 3 build |
| 0C — Supabase CLI & project | `[x]` | Hosted + env + GHA secrets; Option A skipped; optional link / email-confirm-off |
| 0D — Sanity check | `[x]` | Dev + auth smoke OK; optional `wrangler deploy` later |
| 1 — Align config | `[x]` | Worker renamed to `progressapp`; astro config confirmed; Worker registered on Phase 3 deploy |
| 2 — External integrations | `[~]` | Live URL known; **manual** Supabase Site URL/redirects still needed; OpenRouter deferred |
| 3 — Manual first deploy | `[x]` | https://progressapp.julpawcio.workers.dev — smoke OK |
| 4 — Workers Builds auto-deploy | `[~]` | CI→`main`; Connect GitHub app in CF dashboard still required |
| 5 — Hardening & docs | `[~]` | Docs aligned; Access / Paid / custom domain optional later |
| 6 — Edge-case playbook | `[ ]` | Reference; check items when hit |

## References

- [context/foundation/infrastructure.md](../../foundation/infrastructure.md) — platform decision, risks, operational story
- [README — Supabase Configuration](../../../README.md#supabase-configuration) — local Docker vs hosted keys
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)

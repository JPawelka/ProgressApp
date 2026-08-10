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
- **Auto-deploy on `master`**: **Cloudflare Workers Builds** (GitHub app). Do **not** add `wrangler-action` or any GitHub Actions deploy job.
- **GitHub Actions** ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)): **lint + build only**.
- **Worker name**: rename `10x-astro-starter` → `progress-app` in `wrangler.jsonc` so the dashboard Worker name matches config (Workers Builds fails if they diverge).
- **Production branch**: `master` (matches existing CI).
- **Paid Workers** (~$5/mo) before public SSR traffic — Free tier ~10 ms CPU/invocation is too tight for Astro SSR + Supabase cookie auth.

## Out of scope

- Implementing OpenRouter / AI features
- Multi-region HA / DR
- Migrating off Workers to Vercel/Netlify
- Adding GHA-based deploy

---

## Phase 0 — Prerequisites (CLI & accounts)

Configure local tooling before any production deploy. Complete **0A → 0B → 0C** in order, then optionally 0D.

### 0A — Node & project install

- [ ] Install / switch to Node **22.14.0** (see [`.nvmrc`](../../../.nvmrc)):

```bash
nvm install 22.14.0   # if missing
nvm use               # reads .nvmrc
node -v               # expect v22.14.0
```

- [ ] Install dependencies from the repo root:

```bash
npm ci                # preferred (lockfile); or npm install on first clone
```

- [ ] Confirm scripts resolve: `npm run lint -- --help` or `npx astro --version` (Astro ^6.3)

### 0B — Configure Wrangler (Cloudflare CLI)

Wrangler ships as a **devDependency** (`wrangler` ^4.90). Prefer `npx wrangler …` so the repo pin is used — no global install required.

- [ ] Create or sign in to a [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [ ] Enable **Workers Paid** before public SSR traffic (optional for a single smoke deploy; required before real users — Free ~10 ms CPU is too tight for Astro SSR + auth)
- [ ] Log in interactively (opens browser OAuth):

```bash
npx wrangler login
```

- [ ] Or use a non-interactive API token (CI agents / headless): create a token with **Account → Workers Scripts → Edit** (and read account), then:

```bash
export CLOUDFLARE_API_TOKEN="<token>"
# optional if whoami is ambiguous:
# export CLOUDFLARE_ACCOUNT_ID="<account_id>"
```

- [ ] Verify CLI and account binding:

```bash
npx wrangler --version   # expect 4.90.x (from package.json)
npx wrangler whoami      # shows email / account; confirms auth
```

- [ ] Confirm this repo’s Workers config is readable:

```bash
npx wrangler deploy --dry-run   # optional; validates wrangler.jsonc without publishing
```

- [ ] **Do not** install or use Pages-only flows (`wrangler pages dev`, `wrangler pages deploy`) — this project is Workers + Static Assets via [`wrangler.jsonc`](../../../wrangler.jsonc)
- [ ] Local Cloudflare secrets file (gitignored — already in `.gitignore`):

```bash
cp .env.example .dev.vars
# edit .dev.vars — values come from Supabase setup in 0C
```

| File | When | Notes |
| --- | --- | --- |
| `.dev.vars` | `npm run dev` / Wrangler local | Preferred for workerd; never commit |
| `.env` | Node/tooling / some Astro sync paths | Same keys as `.env.example`; never commit |

- [ ] Confirm local loop uses workerd (no separate Pages command):

```bash
npm run dev
# Ctrl+C when healthy
```

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

### 0C — Configure Supabase CLI & project

The `supabase` package is a **devDependency**. Use `npx supabase …`. Auth uses server-only `SUPABASE_URL` / `SUPABASE_KEY` via `astro:env` (see [README Supabase Configuration](../../../README.md#supabase-configuration)).

Pick **one** path for day-to-day local dev; production (Phase 2+) always uses a **hosted** project.

#### Option A — Local Supabase (Docker; good for offline auth)

Requires [Docker](https://www.docker.com/) running and ~7 GB RAM on first pull.

- [ ] Ensure Docker Desktop (or daemon) is running
- [ ] Create env stubs:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

- [ ] Init local config if `supabase/` is missing or incomplete:

```bash
npx supabase --version
npx supabase init          # skip if supabase/config.toml already exists
```

- [ ] Start the local stack:

```bash
npx supabase start
```

- [ ] Copy printed **API URL** and **anon key** into **both** `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

- [ ] Open Studio at `http://localhost:54323` and confirm the project is up
- [ ] Optional: disable **Authentication → Email → Confirm email** for frictionless local sign-up (local dashboard / config)
- [ ] Stop when done: `npx supabase stop`

No app tables are required for MVP auth — Supabase Auth’s `auth.users` is enough until product migrations land.

#### Option B — Hosted Supabase (required for production; fine for local too)

- [ ] Create a project at [supabase.com](https://supabase.com) (or reuse an existing one)
- [ ] Dashboard → **Settings → API**: copy **Project URL** and **`anon` `public`** key (not the `service_role` key)
- [ ] Put them in `.env` and `.dev.vars`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

- [ ] Optional CLI link for migrations / remote ops later:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

- [ ] For local-only email confirmation friction: Dashboard → **Authentication → Providers / Email** → turn **Confirm email** off while developing (re-enable for production if desired)

#### Wire keys for Cloudflare local + CI

- [ ] `.dev.vars` has the same `SUPABASE_*` values you intend the Worker to use locally
- [ ] GitHub repo secrets `SUPABASE_URL` / `SUPABASE_KEY` set for CI build ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)) — use **hosted** values so CI does not depend on Docker
- [ ] Do **not** commit `.env`, `.dev.vars`, or `service_role` keys

### 0D — Sanity check before Phase 1

- [ ] `npm run dev` loads the app; config/status reflects Supabase when keys are set
- [ ] Sign-up / sign-in against the chosen Supabase target (local or hosted)
- [ ] Optional pre-Git smoke (after Phase 1 rename + Phase 3 runtime secrets): `npm run build && npx wrangler deploy`

### CLI cheat sheet (Wrangler + Supabase)

```bash
# --- Node ---
nvm use
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

## Phase 1 — Align project config

- [ ] Rename Worker in [`wrangler.jsonc`](../../../wrangler.jsonc): `"name": "progress-app"` (was `10x-astro-starter`)
- [ ] Keep existing flags: `nodejs_compat`, `assets.binding: "ASSETS"`, `assets.directory: "./dist"`, `observability.enabled: true`, `main: "@astrojs/cloudflare/entrypoints/server"`
- [ ] Confirm [`astro.config.mjs`](../../../astro.config.mjs): `output: "server"`, `adapter: cloudflare()`, env schema for `SUPABASE_URL` / `SUPABASE_KEY` as server secrets
- [ ] Create the Cloudflare Worker in the dashboard with the **same name** `progress-app` (or first `wrangler deploy` will register it — then keep names in sync)

### Secret surfaces (do not mix)

| Surface | Where | Used for |
| --- | --- | --- |
| Local | `.dev.vars` | `npm run dev` / local workerd |
| Build-time | Workers Builds → Build variables & secrets | `astro build` / `astro:env` during CI build on Cloudflare |
| Runtime | Worker Settings → Variables & Secrets, or `wrangler secret put` | Live Worker request handling |
| GitHub Actions | Repo secrets `SUPABASE_URL`, `SUPABASE_KEY` | Lint/build CI only — **not** deploy |

- [ ] Document for the team: Astro 6 removed `Astro.locals.runtime.env` — use `astro:env/server` and/or `import { env } from "cloudflare:workers"`. Current code uses `astro:env/server` in [`src/lib/supabase.ts`](../../../src/lib/supabase.ts)

---

## Phase 2 — External integrations

Assumes Phase **0C** (Supabase CLI / project) is done. Production must use a **hosted** project even if local Docker was used for day-to-day auth.

### Supabase (required now)

- [ ] Confirm a **hosted** Supabase project exists (Phase 0C Option B) — production must not use `http://127.0.0.1:54321`
- [ ] Put hosted `SUPABASE_URL` and `SUPABASE_KEY` (anon) into `.dev.vars` when testing auth against hosted from local `npm run dev`
- [ ] After the first Worker URL exists (Phase 3): in Supabase Dashboard → **Authentication → URL configuration**, set:
  - **Site URL** → `https://progress-app.<account>.workers.dev` (or your final custom domain)
  - **Redirect URLs** → include `https://progress-app.<account>.workers.dev/**` (and custom domain `/**` when added)
  - Also allow local redirects if needed: `http://localhost:4321/**` (or your `astro dev` origin)
- [ ] Smoke cookie sessions on `*.workers.dev` (Secure / SameSite); re-test after attaching a custom domain
- [ ] Keep GitHub Actions repo secrets aligned with the same hosted values so `npm run build` in CI stays green
- [ ] If using `npx supabase link`, keep remote migrations in sync before relying on prod auth data beyond `auth.users`

### OpenRouter (when AI plan generation lands)

- [ ] Add runtime secret: `npx wrangler secret put OPENROUTER_API_KEY` (name TBD to match app code)
- [ ] If the key is required at **build** time, also add it under Workers Builds → Build variables & secrets
- [ ] Keep OpenRouter calls short; edge hop ≠ global DB/AI latency (see infrastructure risk register)
- [ ] After enabling AI paths: smoke-test on workerd after any dependency bump (`nodejs_compat` is not full Node)

---

## Phase 3 — Manual first deploy (prove the path)

Do this once before enabling Git auto-deploy so failures are easier to isolate.

- [ ] Set runtime secrets:
  - `npx wrangler secret put SUPABASE_URL`
  - `npx wrangler secret put SUPABASE_KEY`
- [ ] Build and deploy: `npm run build && npx wrangler deploy`
- [ ] Confirm Worker URL from Wrangler output / dashboard
- [ ] Smoke checklist:
  - [ ] Home page loads
  - [ ] `/auth/signin` (and signup if enabled) renders
  - [ ] Unauthenticated `/dashboard` redirects per middleware
  - [ ] Static assets load (ASSETS binding / `./dist`)
- [ ] Practice rollback: `npx wrangler rollback [VERSION_ID]` (or Dashboard → Versions → Rollback)
- [ ] Note: Supabase migrations do **not** roll back with the Worker — migrate forward or restore DB separately
- [ ] Update Supabase Site URL / Redirect URLs (Phase 2) using the live Worker hostname

---

## Phase 4 — Workers Builds auto-deploy (Cloudflare-owned)

Auto-deploy on `master` is handled by **Cloudflare**, not an external CI/CD deploy job.

- [ ] In Cloudflare Dashboard: Workers & Pages → `progress-app` → **Settings** → **Builds** → **Connect**
- [ ] Install / authorize the **Cloudflare Workers & Pages** GitHub app on this repository
- [ ] Configure build settings:

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | `/` (repo root) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | Enabled |
| Non-production deploy command | `npx wrangler versions upload` |
| Build variables & secrets | `SUPABASE_URL`, `SUPABASE_KEY` (hosted values) |
| Runtime Variables & Secrets | Same names — already set in Phase 3 |

- [ ] Confirm dashboard Worker **name** equals `wrangler.jsonc` `"name": "progress-app"`
- [ ] Push a commit to `master` → expect build → **Active Deployment**
- [ ] Open a PR from a non-`master` branch → expect preview version URL + GitHub PR comment
- [ ] Confirm [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) still has **no** deploy step (lint + build only)
- [ ] Review GitHub app / build token permissions before relying on auto-builds for **fork** PRs

---

## Phase 5 — Hardening & ops

- [ ] Once auth flows are live on previews: protect non-prod hostnames with **Cloudflare Access**
- [ ] Optional: attach a custom domain + DNS; then re-check Supabase redirect URLs and auth cookies
- [ ] Logs: `npx wrangler tail` for live requests; Dashboard Observability (already enabled in `wrangler.jsonc`)
- [ ] Watch CPU / error metrics; stay on **Paid Workers** under real SSR + (later) AI load
- [ ] After dependency bumps: smoke auth + AI paths on workerd before trusting CI-green alone
- [ ] Human approval required for: production publish intent (merge to `master`), secret rotation, domain/DNS changes
- [ ] Agent may: lint/build, read logs with a scoped token, upload preview versions when Builds is connected

### Docs alignment (required before closing this change)

- [ ] Update [`AGENTS.md`](../../../AGENTS.md): state that **Workers Builds** auto-deploys on `master`; GitHub Actions remains CI (lint + build) only; secrets stay split across `.dev.vars` / Workers Builds / runtime / GHA
- [ ] Update [`README.md`](../../../README.md) Deployment + CI sections to match (Workers Builds, not Pages; no GHA deploy)
- [ ] Treat older `cloudflare-pages` / “GHA auto-deploy” hints in [`context/foundation/tech-stack.md`](../../foundation/tech-stack.md) as superseded by [infrastructure.md](../../foundation/infrastructure.md) + this plan

---

## Phase 6 — Edge-case support playbook

Use when something fails. Check the matching box once resolved (or leave `[!]` with a note).

### 1. Build fails: Worker name mismatch

**Symptom**: Workers Builds error that the Worker name does not match Wrangler config.

**Fix**:

- [ ] Ensure dashboard Worker name === `wrangler.jsonc` `"name"` (`progress-app`)
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
| 0A — Node & install | `[ ]` | |
| 0B — Wrangler / Cloudflare CLI | `[ ]` | `wrangler login`, Paid Workers, `.dev.vars` |
| 0C — Supabase CLI & project | `[ ]` | Local Docker and/or hosted + link |
| 0D — Sanity check | `[ ]` | |
| 1 — Align config | `[ ]` | Includes Worker rename |
| 2 — External integrations | `[ ]` | Hosted Supabase URLs; OpenRouter later |
| 3 — Manual first deploy | `[ ]` | |
| 4 — Workers Builds auto-deploy | `[ ]` | Cloudflare-owned on `master` |
| 5 — Hardening & docs | `[ ]` | Includes AGENTS.md / README updates |
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

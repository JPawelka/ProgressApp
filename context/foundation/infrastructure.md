---
project: progress-app
researched_at: 2026-08-07
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare
---

## Recommendation

**Deploy on Cloudflare Workers.**

ProgressApp already ships Astro 6 SSR with `@astrojs/cloudflare` ^13.5, `wrangler` ^4.90, and a correct Workers Static Assets config (`main: "@astrojs/cloudflare/entrypoints/server"`). Interview constraints — request/response only, global users, external Supabase + Gemini, Cloudflare familiarity — all align with Workers. It scored Pass on all five agent-friendly criteria; Vercel is the runner-up if a JAMstack commercial host is preferred later.

## Platform Comparison

Scored Pass / Partial / Fail against CLI-first, managed/serverless, agent-readable docs, stable deploy API, and MCP/integration. Soft weights: global edge preferred; existing Cloudflare familiarity breaks ties; co-located DB not required (Supabase + Gemini stay external). No hard filter dropped candidates (persistent connections not required).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP public beta) | 4 Pass / 1 Partial |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3 Pass / 2 Partial |
| Fly.io | Pass | Pass | Pass | Partial | Pass | 4 Pass / 1 Partial |
| Railway | Partial | Pass | Pass | Partial | Partial | 2 Pass / 3 Partial |
| Render | Pass | Pass | Pass | Pass | Pass | 5 Pass |

**Cloudflare** — Native stack path; Wrangler deploy/rollback/tail; `llms.txt` + MDX docs; managed MCP; ~$5/mo Paid Workers recommended for SSR CPU. Global edge. External Supabase/Gemini fit the fetch model.

**Vercel** — Strong CLI and docs; Astro via `@astrojs/vercel`. MCP public beta. Commercial MVP needs Pro (~$20/mo). Requires adapter swap from Cloudflare. SSR defaults to a single region unless configured for more.

**Netlify** — Astro via `@astrojs/netlify`; official MCP GA; credit-based pricing can stay cheap at low traffic. Rollback is weaker in the CLI (UI/API restore). Adapter swap required.

**Fly.io** — Container Machines, solid `flyctl` + MCP; good if persistent processes appear later. No ongoing free tier; compute billed always-on unless autostop. Requires `@astrojs/node` + Dockerfile; not edge-isolate SSR.

**Railway** — Fast Node DX and docs (`llms.txt`); rollback dashboard-only; remote MCP still in public testing. Regional always-on cost; adapter swap.

**Render** — Full Pass on criteria and hosted MCP, but Web Services are regional — poor fit for the global-latency preference versus Workers. Free tier sleeps; Starter ~$7/mo. Adapter swap.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Won on stack fit (already wired), global edge, agent ops (Wrangler + docs + MCP), and low MVP cost with Paid Workers. External Supabase/Gemini match the interview answer. Tech-stack frontmatter hinted `cloudflare-pages`; current platform direction is **Workers + Static Assets** — this project’s `wrangler.jsonc` already follows that path.

#### 2. Vercel

Best alternative if Cloudflare Node-compat or ops friction becomes blocking. Excellent deploy DX and preview story; commercial Pro cost and adapter migration are the gap versus the recommendation.

#### 3. Netlify

Credible serverless + global CDN option with GA MCP. Trails on CLI rollback and requires leaving the existing Cloudflare adapter; credit accounting adds a small cognitive tax for a solo after-hours MVP.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Free Workers ~10 ms CPU/invocation is tight for Astro SSR + Supabase cookie auth; unpaid Free can fail under real SSR load — plan on Paid ($5/mo).
2. `workerd` + `nodejs_compat` is not full Node; a transitive dependency can break only in production.
3. Astro 6 removed `Astro.locals.runtime.env` — secrets must use `cloudflare:workers` / Wrangler secrets; outdated tutorials mislead.
4. Pages vs Workers messaging is still mixed in older guides; wrong CI target wastes time (this repo is Workers-configured).
5. “Global edge” only covers the Worker hop — Supabase and Gemini remain central and dominate latency for AI plan generation.

### Pre-Mortem — How This Could Fail

The team deployed early on Free Workers and treated edge as free infinity. Evening traffic plus Gemini-backed plan generation pushed CPU past Free limits; intermittent Worker errors looked like “random flakiness.” Secrets drifted between `.dev.vars`, the dashboard, and GitHub Actions. A wrangler bump plus a Node-only transitive dep passed CI build but failed at runtime. Preview URLs stayed world-readable without Access. Months later the “simple” edge deploy was a Pages/Workers identity crisis, unpaid Free-tier traps, and hard-to-read logs — solvable on day one with Paid Workers, one Workers+GitHub path, and Access on previews.

### Unknown Unknowns

- On Astro 6 + `@astrojs/cloudflare` v13, `astro dev` / `astro preview` already use the Cloudflare Vite plugin and `workerd` — a separate `wrangler pages dev` loop is usually legacy for this stack.
- Cloudflare environments are selected at **build** time (`CLOUDFLARE_ENV=… astro build`), not only via `wrangler deploy --env`.
- Free vs Paid is driven by **CPU time**, not request count — light static traffic can stay Free; heavy SSR+AI needs Paid.
- Cookie sessions on `*.workers.dev` vs a custom domain need explicit cookie/domain checks for Supabase SSR.
- Agents need a scoped Cloudflare API token / `wrangler login` before MCP or `wrangler tail` can read production.

## Operational Story

- **Preview deploys**: Prefer Workers Builds or GitHub Actions that run `npx astro build && npx wrangler versions upload` / preview URLs; protect non-prod with Cloudflare Access if auth flows are live. Fork PRs need token permissions reviewed before auto-deploy.
- **Secrets**: Local `.dev.vars` (gitignored); production via `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` / `GEMINI_API_KEY`. Mirror the same names in GitHub Actions secrets for CI builds (Supabase only for build). Rotate by putting a new secret value, then redeploy if the Worker caches env at deploy time.
- **Rollback**: `npx wrangler rollback [VERSION_ID]` (or dashboard Versions → rollback). Typical revert is minutes. Database migrations on Supabase do **not** roll back with the Worker — migrate forward or restore DB separately.
- **Approval**: Human required for production publish (merge to `master` / explicit prod deploy), secret rotation, and domain/DNS changes. Agent may run lint/build, upload preview versions, and read logs with a read-scoped token.
- **Logs**: `npx wrangler tail` for live Worker logs; Cloudflare dashboard Observability (enabled in `wrangler.jsonc`); Cloudflare MCP / API for structured access when authenticated.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-tier CPU limit breaks SSR under load | Devil's advocate / Pre-mortem | H | M | Enable Workers Paid ($5/mo) before public traffic; watch CPU metrics |
| Node-compat / dependency break on workerd | Devil's advocate / Research | M | H | Keep `nodejs_compat`; smoke-test auth + Gemini paths after dependency bumps; prefer edge-safe SDKs |
| Wrong env/secrets API from Astro 5 tutorials | Devil's advocate / Unknown unknowns | M | M | Use `cloudflare:workers` / Wrangler secrets only; document in AGENTS.md |
| Pages vs Workers CI confusion | Pre-mortem / Research | M | M | Deploy only via Workers + existing `wrangler.jsonc`; ignore Pages-only tutorials |
| Edge ≠ global DB/AI latency | Devil's advocate | H | L | Accept for MVP; keep Gemini calls short; cache plan templates if needed later |
| Public preview URLs leak auth flows | Pre-mortem | M | M | Cloudflare Access on preview hostnames once login ships |
| Build-time env selection surprises | Unknown unknowns | L | M | Document `CLOUDFLARE_ENV=… astro build && wrangler deploy` if multi-env is introduced |

## Getting Started

Stack-accurate for this repo (Astro ^6.3.1, `@astrojs/cloudflare` ^13.5, `wrangler` ^4.90) — adapter and `wrangler.jsonc` are already present.

1. Authenticate: `npx wrangler login` (or set a Cloudflare API token with Workers edit).
2. Local secrets: copy `.env.example` values into `.dev.vars` as `SUPABASE_URL` / `SUPABASE_KEY` / `GEMINI_API_KEY`. Use `npm run dev` — Astro 6 already runs the Workers (`workerd`) runtime; do not assume a separate Pages dev command.
3. Production secrets: `npx wrangler secret put SUPABASE_URL`, `SUPABASE_KEY`, and `GEMINI_API_KEY`.
4. Deploy: `npm run build && npx wrangler deploy` (or `npx astro build && npx wrangler deploy`). Confirm the Worker URL; attach a custom domain when ready.
5. Optional: wire GitHub Actions deploy after CI green on `master` with the same build + `wrangler deploy`, using repository secrets already required for build (`SUPABASE_URL`, `SUPABASE_KEY`). Prefer Workers Paid before real SSR traffic.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)

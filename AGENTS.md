# Repository Guidelines

ProgressApp is an Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase auth) on Cloudflare Workers. Treat @CLAUDE.md as the authoritative agent playbook; product scope is in @context/foundation/prd.md.

## Hard Rules

- Keep SSR (`output: "server"` in @astro.config.mjs). Every API route must export `const prerender = false`.
- Resolve auth via cookie SSR in @src/lib/supabase.ts; gate pages with `PROTECTED_ROUTES` in @src/middleware.ts — do not bypass either.
- New Supabase tables: enable RLS with per-operation, per-role policies. Migrations live in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`.
- API handlers: uppercase `GET`/`POST` only; validate bodies/params with zod.
- Merge Tailwind classes with `cn()` from `@/lib/utils`. No Next.js `"use client"`. Extract hooks to `src/components/hooks/`. Shared entities/DTOs go in @src/types.ts.
- Never commit secrets. Use `SUPABASE_URL` / `SUPABASE_KEY` from @.env.example (`.env` for Node, `.dev.vars` for Wrangler). Env is server-only via `astro:env/server` in @astro.config.mjs — do **not** use removed `Astro.locals.runtime.env` (Astro 5 tutorials). Prefer `import { env } from "cloudflare:workers"` only when reading Worker bindings. Deploy with `npx wrangler deploy` (@wrangler.jsonc; Worker name `progressapp`).
- **Deploy path:** Cloudflare **Workers Builds** auto-deploys on push to `main` once connected. GitHub Actions (@.github/workflows/ci.yml) stays **lint + build only** — no GHA deploy. Keep secrets split: `.dev.vars` (local), Workers Builds build vars, Worker runtime secrets (`wrangler secret put`), GHA repo secrets (CI build).

## Build, Test, and Development Commands

- Scripts: @package.json. Caveats: `dev` runs Cloudflare workerd SSR; `build` needs Supabase env; no unit/e2e test runner yet.
- Use Node `22.14.0` (@.nvmrc).

## Project Structure & Module Organization

- `src/pages/` — Astro pages and `api/` routes; `src/components/` — interactive React + `ui/` (shadcn); `src/lib/` — helpers/services; `src/layouts/`, `src/styles/`.
- `public/` — static assets; `supabase/` — local Supabase config; `context/foundation/` — PRD and stack decisions (@context/foundation/tech-stack.md).

## Coding Style & Naming Conventions

- Import with `@/*` → `src/*` (@tsconfig.json).
- Prefer Astro for static content; React only when interactivity is required. Add shadcn pieces with `npx shadcn@latest add <name>` into `src/components/ui/` ("new-york").
- Husky/lint-staged: eslint on `*.{ts,tsx,astro}`, prettier on `*.{json,css,md}` (@eslint.config.js, @.prettierrc.json).

## Commit & Pull Request Guidelines

- History is thin; use imperative, specific titles (observed: descriptive scaffold commit, not Conventional Commits prefixes).
- CI (@.github/workflows/ci.yml) on push/PR to `main`: `npm ci` → `npx astro sync` → lint → build. Build needs repository secrets `SUPABASE_URL` and `SUPABASE_KEY`. Align PR target with that workflow branch.

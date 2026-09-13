# Repository Guidelines

ProgressApp is an Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase auth) on Cloudflare Workers. Treat @CLAUDE.md as the authoritative agent playbook; product scope is in @context/foundation/prd.md.

## Hard Rules

- Keep SSR (`output: "server"` in @astro.config.mjs). Every API route must export `const prerender = false`.
- Resolve auth via cookie SSR in @src/lib/supabase.ts; gate pages with `PROTECTED_ROUTES` in @src/middleware.ts — do not bypass either.
- New Supabase tables: enable RLS with per-operation, per-role policies. Migrations live in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`.
- API handlers: uppercase `GET`/`POST` only; validate bodies/params with zod.
- Merge Tailwind classes with `cn()` from `@/lib/utils`. No Next.js `"use client"`. Extract hooks to `src/components/hooks/`. Shared entities/DTOs go in @src/types.ts.
- Never commit secrets. Use `SUPABASE_URL` / `SUPABASE_KEY` from @.env.example (`.env` for Node, `.dev.vars` for Wrangler). Env is server-only via `astro:env/server` in @astro.config.mjs — do **not** use removed `Astro.locals.runtime.env` (Astro 5 tutorials). Prefer `import { env } from "cloudflare:workers"` only when reading Worker bindings. Deploy with `npx wrangler deploy` (@wrangler.jsonc; Worker name `progressapp`).
- **Deploy path:** Cloudflare **Workers Builds** auto-deploys on push to `main` once connected. GitHub Actions (@.github/workflows/ci.yml) is **lint + Vitest + build + Playwright** — no GHA deploy. Keep secrets split: `.dev.vars` (local), Workers Builds build vars, Worker runtime secrets (`wrangler secret put`), GHA repo secrets (CI build + e2e).

## Build, Test, and Development Commands

- `npm run dev` — Cloudflare workerd SSR
- `npm test` — Vitest unit tests (`vitest run`). Also runs in the pre-commit hook; a failing run aborts the commit.
- `npm run test:e2e` — Playwright (`playwright test`). Auth via `storageState` from `tests/auth.setup.ts` (`E2E_EMAIL` / `E2E_PASSWORD`). Not part of the pre-commit hook; GitHub Actions runs it after lint + Vitest + build.
- `npm run lint` / `npm run build` — type-checked ESLint; production build (needs Supabase env)
- Use Node `22.14.0` (@.nvmrc). Scripts live in @package.json.

## Project Structure & Module Organization

- `src/pages/` — Astro pages and `api/` routes; `src/components/` — interactive React + `ui/` (shadcn); `src/lib/` — helpers/services; `src/layouts/`, `src/styles/`.
- `public/` — static assets; `supabase/` — local Supabase config; `context/foundation/` — PRD and stack decisions (@context/foundation/tech-stack.md).

## Coding Style & Naming Conventions

- Import with `@/*` → `src/*` (@tsconfig.json).
- Prefer Astro for static content; React only when interactivity is required. Add shadcn pieces with `npx shadcn@latest add <name>` into `src/components/ui/` ("new-york").
- Husky pre-commit: lint-staged (eslint on `*.{ts,tsx,astro}`, prettier on `*.{json,css,md}`) then **`npm test`**. A failing test run blocks the commit.

## E2E Testing Rules

- Use getByRole, getByLabel, getByText as primary locators.
  Fall back to getByTestId only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use page.waitForTimeout(). Wait for specific conditions:
  toBeVisible(), waitForURL(), waitForResponse().
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data
  to avoid collisions in parallel runs. Clean up in afterEach.
- Use storageState for authentication — never log in through UI
  in individual tests.

## Commit & Pull Request Guidelines

- History is thin; use imperative, specific titles (observed: descriptive scaffold commit, not Conventional Commits prefixes).
- CI (@.github/workflows/ci.yml) on push/PR to `main`: lint → **`npm test`** → build, then Playwright e2e. Build needs `SUPABASE_URL` and `SUPABASE_KEY`. E2E needs those plus `E2E_EMAIL` and `E2E_PASSWORD` (dedicated test account). Align PR target with that workflow branch.

---
starter_id: 10x-astro-starter
package_manager: npm
project_name: progress-app
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: lint-build-only
  # Superseded: earlier draft used cloudflare-pages + auto-deploy-on-merge.
  # Canonical deploy story: context/foundation/infrastructure.md +
  # context/changes/deployment/deployment-plan.md (Workers Builds on main;
  # GHA lint+build only).
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

ProgressApp is a solo, after-hours web MVP (3 weeks) that needs auth, session
history, and AI plan generation. The recommended default for web + JavaScript
is Astro + React + Supabase + Cloudflare: TypeScript end-to-end, Postgres and
auth out of the box, and edge deploy on Cloudflare Workers (Workers + Static
Assets). Auth and AI flags
are set from the PRD; payments, realtime, and background jobs are out of scope.
AI plan generation is wired after scaffolding via an LLM SDK — not bundled in
the starter. CI is GitHub Actions (lint + build only); production deploy is
Cloudflare Workers Builds on merge to `main`.

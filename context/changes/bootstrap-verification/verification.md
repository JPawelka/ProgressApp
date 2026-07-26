---
bootstrapped_at: 2026-07-26T15:37:05Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: progress-app
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: progress-app
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

ProgressApp is a solo, after-hours web MVP (3 weeks) that needs auth, session
history, and AI plan generation. The recommended default for web + JavaScript
is Astro + React + Supabase + Cloudflare: TypeScript end-to-end, Postgres and
auth out of the box, and edge deploy on Cloudflare Pages. Auth and AI flags
are set from the PRD; payments, realtime, and background jobs are out of scope.
AI plan generation is wired after scaffolding via an LLM SDK — not bundled in
the starter. CI is GitHub Actions with auto-deploy on merge to main.

## Pre-scaffold verification

| Signal             | Value                                                    | Severity | Notes                                      |
| ------------------ | -------------------------------------------------------- | -------- | ------------------------------------------ |
| npm package        | not run                                                  | —        | cmd_template starts with `git clone`     |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh    | from card.docs_url via GitHub API          |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 12 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/12/7/2

#### CRITICAL findings

- **tar** (`<=7.5.20`) — node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling). Direct: False. Fix available: True. https://github.com/advisories/GHSA-vmf3-w455-68vh

#### HIGH findings

- **astro** (`<=7.0.9`) — Astro: Reflected XSS via unescaped slot name. Direct: True. Fix available: True. https://github.com/advisories/GHSA-8hv8-536x-4wqp
- **brace-expansion** (`<=5.0.7`) — brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups. Direct: False. Fix available: True. https://github.com/advisories/GHSA-3jxr-9vmj-r5cp
- **devalue** (`5.6.3 - 5.8.0`) — Svelte devalue: DoS via sparse array deserialization. Direct: False. Fix available: True. https://github.com/advisories/GHSA-77vg-94rm-hx3p
- **fast-uri** (`3.0.0 - 3.1.3`) — fast-uri vulnerable to host confusion via literal backslash authority delimiter. Direct: False. Fix available: True. https://github.com/advisories/GHSA-v2hh-gcrm-f6hx
- **js-yaml** (`4.0.0 - 4.2.0`) — JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases. Direct: False. Fix available: True. https://github.com/advisories/GHSA-h67p-54hq-rp68
- **miniflare** (`<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260721.0`) — via sharp. Direct: False. Fix available: True.
- **postcss** (`<=8.5.17`) — PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure. Direct: False. Fix available: True. https://github.com/advisories/GHSA-r28c-9q8g-f849
- **sharp** (`<0.35.0`) — sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591. Direct: False. Fix available: True. https://github.com/advisories/GHSA-f88m-g3jw-g9cj
- **svgo** (`4.0.0 - 4.0.1`) — SVGO removeScripts plugin leaves some executable scripts intact. Direct: False. Fix available: True. https://github.com/advisories/GHSA-2p49-hgcm-8545
- **undici** (`7.0.0 - 7.27.2`) — undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent. Direct: False. Fix available: True. https://github.com/advisories/GHSA-vmh5-mc38-953g
- **vite** (`7.0.0 - 7.3.3`) — launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows. Direct: False. Fix available: True. https://github.com/advisories/GHSA-v6wh-96g9-6wx3
- **ws** (`8.0.0 - 8.20.1`) — ws: Uninitialized memory disclosure. Direct: False. Fix available: True. https://github.com/advisories/GHSA-58qx-3vcg-4xpx

#### MODERATE findings

- **@astrojs/language-server** (`2.14.0 - 2.16.10`) — via volar-service-yaml. Direct: False. Fix available: True.
- **@cloudflare/vite-plugin** (`<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`) — via miniflare. Direct: False. Fix available: True.
- **supabase** (`1.1.6 - 2.98.2`) — via tar. Direct: True. Fix available: True.
- **volar-service-yaml** (`<=0.0.70`) — via yaml-language-server. Direct: False. Fix available: True.
- **wrangler** (`<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`) — via esbuild. Direct: True. Fix available: True.
- **yaml** (`2.0.0 - 2.8.2`) — yaml is vulnerable to Stack Overflow via deeply nested YAML collections. Direct: False. Fix available: True. https://github.com/advisories/GHSA-48c2-rrv3-qjmp
- **yaml-language-server** (`1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`) — via yaml. Direct: False. Fix available: True.

#### LOW / INFO findings

- **@babel/core** (`<=7.29.0`) — @babel/core: Arbitrary File Read via sourceMappingURL Comment. Direct: False. Fix available: True. https://github.com/advisories/GHSA-4x5r-pxfx-6jf8
- **esbuild** (`0.27.3 - 0.28.0`) — esbuild allows arbitrary file read when running the development server on Windows. Direct: False. Fix available: True. https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.

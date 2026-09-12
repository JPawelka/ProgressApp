---
change_id: testing-owner-isolation-and-untrusted-input
title: Owner isolation and untrusted-input tests (rollout Phase 3)
status: archived
created: 2026-09-12
updated: 2026-09-12
archived_at: 2026-09-12T18:30:00Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Owner isolation and untrusted input".
Risks covered: #3 (User A reads or mutates User B’s plans/sessions via another user’s id), #7 (Untrusted client body for log/generate/edit is stored as valid).
Test types planned: integration.
Risk response intent:
- #3: Other user’s id yields 401/404 and no row change on their plan/session. Challenge “logged in is enough” (auth ≠ ownership). Avoid mocking RLS away or only testing the unauthenticated redirect.
- #7: Invalid body is 4xx and not stored; foreign/cross-plan ids do not attach. Challenge “client validation is enough”. Avoid testing only the TypeScript type.
After creating the folder, follow the downstream continuation rule.

---
change_id: testing-persist-and-error-visibility
title: Persist completeness and generate/log/apply error visibility
status: impl_reviewed
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Persist and error visibility".
Risks covered: #2 (plan or session save looks successful but rows are missing or incomplete), #4 (generate / log / apply returns an error and the UI shows nothing, so the user proceeds as if it worked). Test types planned: integration + island tests.
Risk response intent: #2 prove failed or partial persist is visible as failure, complete sets that should save are present, and incomplete sets are not treated as a full session; #4 prove a non-success / error payload from generate, log, or apply is shown and the form does not look like success.
After creating the folder, follow the downstream continuation rule.

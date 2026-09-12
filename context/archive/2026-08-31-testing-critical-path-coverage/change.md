---
change_id: testing-critical-path-coverage
title: Critical-path tests for suggestion, skip/apply, and rule bounds
status: archived
created: 2026-08-31
updated: 2026-09-12
archived_at: 2026-09-12T16:56:28Z
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 (no suggestion after a successful log), #5 (skip / Accept all / Save disagree with the product contract), #6 (shown or applied load violates the locked rule). Test types planned: unit + integration.
Risk response intent: #1 prove after a successful log the owner is offered increase/hold/deload + load for logged exercises and a missing session id does not silently skip that screen; #5 prove skip leaves defaults unchanged, Accept all writes suggestions, Save writes field values, skipped lifts are not in the write set; #6 prove decision + kg match the locked PRD rule (hits vs default reps, heaviest, +2.5), not whatever is currently shown.
After creating the folder, follow the downstream continuation rule.

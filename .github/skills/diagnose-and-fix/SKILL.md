---
name: diagnose-and-fix
description: 'Diagnose runtime failures, regressions, failing tests, and frontend/backend contract mismatches using a reproducible failure and a focused regression check.'
---

# Diagnose And Fix

1. Capture the failing command or user-visible behavior, expected result and
   runtime. Check the selected Node/pnpm versions before changing dependencies.
2. Find the code that controls the behavior, not just the forwarding handler.
   Read one neighboring test or call site and state a falsifiable hypothesis.
3. When the failure involves a domain feature, read the relevant canonical guide:
   [camera/upload](../../../docs/camera-and-initial-image-playbook.md),
   [Leonardo](../../../docs/leonardo-integration-playbook.md), or
   [data/jobs](../../../docs/prisma-data-and-jobs-playbook.md).
   Ask before changing requirements. Do not reproduce a paid submission by
   blindly retrying it; uncertain acceptance requires reconciliation or review.
4. Add or run the cheapest discriminating test. Make a small repair and rerun
   that exact check before investigating unrelated surfaces.
5. If the check falsifies the hypothesis, follow the nearest controlling call.
   Preserve the reproduction and do not weaken assertions to hide the failure.
6. Run the relevant checks from the [README](../../../README.md), including
   production browser checks when application behavior changed.

Complete with the root cause, regression evidence, actual validation results and
remaining risks. Do not claim a fix from a clean diff or mock-only happy path.

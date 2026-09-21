---
name: verify-change
description: 'Verify a change before handoff or pull-request review with Markdown formatting and linting, cross-platform script checks, merge gates, playbook requirements and reported evidence.'
---

# Verify A Change

1. Inspect the diff and identify changed ownership boundaries. Preserve unrelated
   user changes. Distinguish implemented features from future architecture.
2. For feature work, read applicable acceptance requirements in the
   [camera](../../../docs/camera-and-initial-image-playbook.md),
   [Leonardo](../../../docs/leonardo-integration-playbook.md), and
   [data/jobs](../../../docs/prisma-data-and-jobs-playbook.md) playbooks.
   Only require feature-specific runtime checks once that feature exists.
3. Bootstrap with the pinned Node/pnpm versions, frozen install and `pnpm prepare`.
   Run focused checks during iteration, then `pnpm check` for the completed change.
4. For app, API or build changes, install Chromium if needed and run
   `pnpm test:e2e`. It builds once and owns an isolated production Node server.
   Use `E2E_PORT` for a port conflict; do not reuse an unknown running server.
5. Review browser traces/screenshots when UI behavior changes using the
   [design checklist](../../../docs/design-playbook.md#implementation-and-review-checklist).
   Check mobile layout, keyboard access, image framing and error recovery. Only
   claim comparison to reference screenshots actually available. The Node build is not evidence
   of a working Netlify deployment or a completed external privacy review.
6. For harness/docs changes, check reference coverage and metadata with
   `pnpm check:harness`; inspect heading anchors and Copilot discovery manually.
   See the [harness guide](../../../docs/ai-development.md) for representative prompts.
   Also run `pnpm format:check` and `pnpm lint:markdown`, including Markdown under
   `.github`. Fix formatting and structural errors, then rerun both checks.
7. For scripts, tooling or CI changes, review the
   [cross-platform rules](../../instructions/tooling.instructions.md#cross-platform-scripts).
   Check shell syntax, environment variables, path spaces, separators, filename
   casing and subprocess execution. Run focused checks on the current OS and
   inspect the Windows/Linux/macOS CI results when available. Do not claim all
   platforms pass based on one local run or the presence of a CI matrix.

Report commands and results, any skipped checks and why, unresolved gates, and
the OS tested and whether the change is ready for review. Never fabricate test
success or invoke paid providers to satisfy a generic verification request.

---
name: compound-session
description: 'Inspect Copilot session history and debug logs after repeated errors, rework, user correction, or an inaccurate handoff; extract evidence-backed lessons and compound them into concise repository instructions, skills, tests, validators, documentation, or memory.'
argument-hint: 'Session ID or current session, plus any area to emphasize'
---

# Compound A Session

Use this workflow to improve the AI harness after a costly session. The goal is
fewer repeated mistakes, not a transcript or a growing list of one-off rules.

1. Identify the session and repository. Load the installed Chronicle skill and
   follow its current database schema before querying session metadata, turns,
   checkpoints or files; never guess column names. Use the target-session debug
   log as a fallback when indexed turns are unavailable. For an active session,
   also use the visible transcript/tool results because indexing can lag and the
   raw log may contain only startup metadata. Never read secrets or copy
   credentials from logs into repository files.
2. State the evidence quality. Distinguish exact logged failures, tool results,
   user corrections and final validation from inference. Missing/truncated logs
   remain unknown; do not manufacture counts, commands or causes.
3. Build a short failure chain with symptom, root cause, recovery and prevention.
   Include false completion claims, repeated command failures, unnecessary reads,
   dependency/runtime assumptions and validation that ran too late. Ignore harmless
   exploratory misses unless they reveal a reusable routing problem.
4. Check existing instructions, skills, playbooks, tests and repository memory
   before proposing anything. Prefer amending the owning rule over duplicating it.
   Put always-on conventions in instructions, repeatable procedures in skills,
   deterministic structure in validators/tests and verified repository facts in
   repository memory. Keep product requirements in canonical playbooks.
5. Compound only a recurring pattern or a high-cost failure with a clear reusable
   prevention. Each edit must name the trigger and an observable check. Do not
   encode brittle command output, personal paths, session IDs or speculative
   architecture.
6. For package-related lessons, follow the
   [tooling package policy](../../instructions/tooling.instructions.md#third-party-packages):
   check freshness, update direct packages, inspect peer/engine warnings and prove
   compatibility exceptions with a focused failing check.
7. Add the smallest regression guard available. Run it immediately after the
   first harness edit, then run `pnpm format:check`, `pnpm lint:markdown`,
   `pnpm check:harness` and any tests for changed validators. Run `pnpm check`
   when code, manifests or lockfiles changed.
8. Report the evidence reviewed, lessons accepted or rejected, files changed,
   package freshness/exception state, command results and unresolved risks. Never
   claim an async process is active until startup or a direct request confirms it.

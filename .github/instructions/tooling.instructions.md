---
description: 'Use when editing workspace dependencies, cross-platform scripts, Nuxt configuration, CI, Markdown formatting or linting, documentation, or Copilot instructions and skills.'
applyTo: 'package.json,pnpm-workspace.yaml,pnpm-lock.yaml,.nvmrc,.editorconfig,.gitattributes,.prettierrc.json,.prettierignore,.markdownlint-cli2.jsonc,eslint.config.mjs,README.md,apps/*/package.json,apps/web/nuxt.config.ts,apps/web/tsconfig.json,packages/*/package.json,packages/*/tsconfig.json,.github/**,scripts/**,docs/**'
---

# Tooling And Documentation

- Use Node `>=24.11.0 <25` and the root `packageManager` pin. Commit the generated
  pnpm lockfile. pnpm 12 uses `engineStrict`, `saveExact` and explicit `allowBuilds`
  in `pnpm-workspace.yaml`; non-registry settings do not belong in `.npmrc`.
- Nuxt owns generated context configs. Extend them through `nuxt.config.ts`,
  including the test files; never edit `.nuxt` or replace its alias maps.
- ESLint handles code correctness and dependency boundaries; Prettier handles
  formatting, including Markdown; markdownlint handles Markdown structure.
  Run `pnpm format:check` and `pnpm lint:markdown` after Markdown edits, including
  instructions and skills. Use `pnpm format` and `pnpm lint:fix` for fixes, then
  rerun the checks. Keep generated output, secrets, dependencies and reports ignored.
- Keep Markdown discovery in the linter configuration, not shell-expanded globs.
  Markdown line-length rule MD013 is disabled because Prettier owns wrapping;
  do not disable other rules just to suppress a new failure without justification.
- Update working commands in manifests, README, CI and harness guidance together.
  Pin Actions to verified commits and use least-privilege permissions. Avoid
  secret-bearing workflows for untrusted pull requests.
- Keep the playbooks canonical and their dates honest. Add direct root and
  task-specific links when introducing a playbook; run `pnpm check:harness`.
  Do not duplicate complete playbook sections into instruction bodies.
- For future dependency/platform work, first read the
  [data and jobs baseline](../../docs/prisma-data-and-jobs-playbook.md).
  Recheck availability and compatibility, and preserve milestone boundaries.
- Skill folders must match their YAML `name`, have meaningful trigger
  descriptions and actual procedures. Scoped instructions use specific
  comma-separated `applyTo` globs that match real files. They are additive,
  not an ordered override system. Ask about conflicting requirements.

## Cross-Platform Scripts

- Support Windows, Linux and macOS without requiring Bash, WSL, GNU utilities or
  a particular developer shell. Prefer Node `.mjs` scripts for filesystem work,
  environment setup and process orchestration; use `node:fs`, `node:path`,
  `node:url` and `node:os` instead of `rm`, `cp`, `sed` or shell path manipulation.
- Use `join`/`resolve`, `fileURLToPath`/`pathToFileURL`, and `tmpdir`/`mkdtemp`.
  Handle spaces and non-ASCII paths. Normalize separators only at glob, URL or
  serialized-path boundaries. Never hard-code drive letters or `/tmp`.
- Launch Node subprocesses with `process.execPath` and argument arrays. For other
  CLIs, use a cross-platform runner or explicitly handle Windows command shims;
  do not assume `shell: true` or a Unix shebang makes an invocation portable.
- Avoid POSIX environment assignments and shell-expanded globs in package
  scripts. Set child environments through Node APIs or workflow `env` mappings.
  Label Bash/zsh, PowerShell and Command Prompt variants in developer docs when
  shell-specific syntax is unavoidable.
- Preserve LF source files through `.gitattributes` and `.editorconfig`; keep
  filename casing consistent on case-sensitive filesystems. Do not rely on
  executable permission bits for scripts invoked with `node`.
- Exercise script regressions with temporary directories and guaranteed cleanup.
  Keep the Windows/Linux/macOS CI matrix for repository checks. Report the OS
  actually tested locally; configured CI is not evidence of a successful run.

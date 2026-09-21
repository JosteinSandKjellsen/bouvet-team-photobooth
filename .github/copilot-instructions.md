# Project Guidelines

Bouvet Team Photobooth is a conference experience for groups visiting the Bouvet
stand, with kiosk and phone support. The planned journey is to choose a fictional
team universe, capture and approve a group photo, generate a recognizable themed
portrait, then share, download or print it and browse the event gallery. It is a
playful shared activity, not a personality assessment. Visitor photos require
clear public-sharing information, bounded retention and private source handling.

The solution is one Nuxt 4/Vue frontend and Nitro backend in a pnpm workspace,
with type-only shared API contracts. Use Node 24 LTS (at least 24.11.0).
The implemented app is still the credential-free health-check foundation;
camera capture, generation, persistence and deployment are not implemented.
Follow the [implementation plan](../docs/implementation-plan.md) for the selected
milestone and unresolved gates; the product vision does not authorize extra work.

## Folder Structure

```text
apps/web/             Nuxt application and configuration
  app/                Vue UI and browser-safe composables
  server/             Nitro API and server-only logic
  test/               Component and browser/API tests
packages/contracts/   Type-only public API DTOs
docs/                 Product plan, design, technical and development guides
.github/              AI instructions, skills and CI workflows
scripts/              Harness validation and regression tests
```

Keep frontend code in `apps/web/app`, server-only code in `apps/web/server`, and
public DTOs in `packages/contracts`. Import contracts through the workspace
package. Never expose secrets, provider IDs, or database models to the browser.
Generated `.nuxt` and `.output` files are not source files.

## Canonical Feature Guidance

Before planning or changing one of these features, read its applicable playbook.
These are binding future baselines, not permission to expand the active task.

| Task                                             | Read                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| Layouts, styling, UI copy or visual verification | [Photobooth design](../docs/design-playbook.md)                           |
| Camera, countdown, image validation or upload    | [Camera and initial images](../docs/camera-and-initial-image-playbook.md) |
| Leonardo requests, completion, cost or cleanup   | [Leonardo integration](../docs/leonardo-integration-playbook.md)          |
| Prisma, PostgreSQL, jobs, storage or deployment  | [Data and jobs](../docs/prisma-data-and-jobs-playbook.md)                 |

Ask the user before resolving conflicting requirements or expanding the active
milestone. Keep the documents canonical; link to them instead of copying their
chapters into instructions. Recheck dated external facts before implementing
their features. Do not interpret a database uniqueness constraint as an
exactly-once paid provider guarantee.

## Working Agreements

Make the smallest testable change. Preserve unrelated user work. Add regression
coverage for behavior changes, run a focused check immediately, then run the
relevant merge gates. Report actual command results and disclose skipped checks.
Do not add speculative frameworks, cloud resources, or external API calls.

Support Windows, Linux and macOS. Prefer portable Node scripts and filesystem
APIs over shell-specific commands; label platform-specific setup examples.
Follow the [tooling rules](instructions/tooling.instructions.md) for scripts,
paths and line endings. Check Markdown with both Prettier and markdownlint,
including documentation, instructions and skills.

## Commands And Completion

Run commands from the repository root with the pinned pnpm version. Bootstrap
with `pnpm install --frozen-lockfile` and `pnpm prepare`. Nuxt's generated types
and lint config must exist before checks. The demo requires no credentials.

- `pnpm dev`: local Nuxt frontend and Nitro backend.
- `pnpm typecheck`: strict contracts, app, server, test and config types.
- `pnpm format:check`: Prettier formatting, including all maintained Markdown.
- `pnpm lint`: ESLint for code and markdownlint for Markdown structure.
- `pnpm lint:markdown`: focused Markdown lint, including the Copilot harness.
- `pnpm test`: non-watch component tests and harness validator regressions.
- `pnpm check:harness`: metadata, file scopes, commands and document links.
- `pnpm check`: formatting, lint, types, tests and harness checks.
- `pnpm test:e2e`: fresh production build and desktop/mobile Chromium tests.
  Install Chromium first with
  `pnpm --filter @bouvet-team-photobooth/web exec playwright install chromium`.

Run a focused test while iterating; run `pnpm check` before handoff and
`pnpm test:e2e` for application behavior or build changes. Never reuse an
unknown server for tests. See the [development guide](../docs/development.md)
for commands and ports,
and the [harness guide](../docs/ai-development.md) for discovery and maintenance.

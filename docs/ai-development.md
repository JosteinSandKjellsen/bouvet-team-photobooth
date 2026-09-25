# AI Development

## Harness Layers

| Layer           | Entry point                                                | Purpose                                                 |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Repository-wide | [Copilot instructions](../.github/copilot-instructions.md) | Architecture, active scope, commands and reading map    |
| File-specific   | [Scoped instructions](../.github/instructions)             | Frontend, backend, contracts, testing and tooling rules |
| On-demand       | [Skills](../.github/skills)                                | Implementation, diagnosis and verification procedures   |

Use the repository-local files in VS Code agent mode and GitHub-hosted Copilot.
No duplicate AGENTS.md, custom agents, prompts, hooks, MCP configuration or
changes to personal trust/approval settings are required. Scoped instructions
are additive, not an ordered override system. Ask the owner about conflicts.

## Canonical Playbooks

The playbooks stay under `docs` as the single source for their domain behavior.
Root instructions directly reference each, and relevant scoped instructions and
skills require loading them for that task. Do not load every playbook for an
unrelated health-check edit or copy their complete chapters into instructions.

| Work                                                                | Required reading                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Product behavior, routes, privacy, milestones, acceptance criteria  | [Product experience](./product-experience-playbook.md) and [implementation plan](./implementation-plan.md) |
| Layouts, styling, UI copy, responsive behavior, visual verification | [Photobooth design](./design-playbook.md)                                                                  |
| Camera, countdown, preview, compression, source upload              | [Camera and initial images](./camera-and-initial-image-playbook.md)                                        |
| Leonardo models, paid submissions, completion, provider cleanup     | [Leonardo integration](./leonardo-integration-playbook.md)                                                 |
| Prisma, PostgreSQL, durable jobs, storage, retention, deployment    | [Data and jobs](./prisma-data-and-jobs-playbook.md)                                                        |

These are approved future baselines. The active scaffold remains database-free
and provider-free. Do not install dependencies, request credentials or make paid
calls just because a future playbook mentions them. Source verification dates
are historical, not evidence that a current provider operation was tested.

The design guide translates the six supplied screen references into durable
guidance; the original screenshot binaries are not in the repository. It does
not override the [product experience](./product-experience-playbook.md) or
[implementation plan](./implementation-plan.md).

The aligned rules distinguish original image bytes, compressed bytes and total
multipart ingress, return public `sourceId` handles, retain landscape 1376 x 768
generation settings, and distinguish cancelling a countdown from leaving the
camera. Temporary transfer buffers and durable source objects have different
cleanup lifetimes. Uncertain paid submissions are not automatically resubmitted,
and source URLs do not prove provider erasure.

Model profiles and theme-to-model mappings are server-only generation
configuration. A model switch is a new versioned profile plus a theme mapping
for future work; the selected profile is persisted on the durable generation.
It must not become a public theme field or a browser control.

## Workflows

- [implement-vertical-slice](../.github/skills/implement-vertical-slice/SKILL.md):
  use for a requested API-backed feature, from contract through regression tests.
- [diagnose-and-fix](../.github/skills/diagnose-and-fix/SKILL.md): use for a failure
  with a reproducible observation and a small discriminating check.
- [testing-user-flows](../.github/skills/testing-user-flows/SKILL.md): use when
  adding or updating component and browser behavior coverage without coupling
  tests to visitor-facing copy.
- [verify-change](../.github/skills/verify-change/SKILL.md): use before handoff or
  review to run the applicable gates and report actual evidence.
- [compound-session](../.github/skills/compound-session/SKILL.md): use after a
  session with repeated failures or correction to extract durable harness
  improvements from session evidence.

Skills have portable `name` and `description` frontmatter and concrete procedures.
VS Code supports slash invocation and task-based discovery; available surfaces
and automatic discovery depend on the installed Copilot version and settings.
These workflow descriptions do not enforce execution on their own.

## Verification

`pnpm format:check` checks Markdown formatting with Prettier, while
`pnpm lint:markdown` checks structural rules with markdownlint. Both include
README, playbooks, instructions and skills and run in `pnpm check`. File discovery
is configured independently of the shell; generated and Git-ignored files are
excluded. MD013 is disabled to leave line wrapping to Prettier.

`pnpm check:harness` validates YAML frontmatter, matching skill/folder names,
nonempty descriptions, narrow file globs, documented root command names, local
link targets, and root plus task-specific references to every playbook. It uses
YAML and Markdown parsers and a glob library, not a language-model judgment.
`pnpm test` includes isolated negative fixtures proving these checks fail.

The validator does not verify external URLs, Markdown heading anchors, provider
facts, requirement consistency, or whether a model actually obeyed a rule.
Review those explicitly. `pnpm check` and `pnpm test:e2e` provide local merge
gates. GitHub branch protection must be configured separately by an owner.

Follow the [cross-platform scripting rules](../.github/instructions/tooling.instructions.md#cross-platform-scripts)
for Node scripts, paths, subprocesses and shell-specific documentation. CI runs
the same quality gates and production browser tests on Windows, Linux and macOS.
Report actual local and remote results separately; unexecuted matrix jobs are
not verified platform support.

To inspect VS Code discovery, open a matching source file, use the Chat
Customization UI to inspect instructions/skills, and inspect attached references
or agent tool activity in a fresh chat. Try these read-only prompts:

1. "Plan camera countdown tests without editing code. Read the product and applicable technical playbook."
2. "Explain the retry rule for an uncertain paid Leonardo submission. Do not call the provider."
3. "Outline the prerequisites for adding durable Prisma jobs without installing anything."
4. "Use verify-change to check the health scaffold and report actual command results."
5. "Plan the photo result layout for kiosk and phone. Read the design guide, identify mockup placeholders, and do not edit code."
6. "Compound the current session into the AI harness. Separate logged evidence from inference and validate each harness edit."
7. "Add a server-only Leonardo model profile for one theme. Read the Leonardo
   playbook, preserve queued-job profile snapshots, and do not expose a model
   selector in browser contracts."

The feature-planning prompts should load the relevant domain guide without treating the
entire future feature as authorized implementation. Ordinary health-check work
should not need the full camera or persistence specification. Structural tests
cannot certify these live editor behaviors; validate them in your Copilot client.

## GitHub Cloud Agent

[copilot-setup-steps.yml](../.github/workflows/copilot-setup-steps.yml) contains
the required single `copilot-setup-steps` job. It sets up Node/pnpm, installs the
frozen dependency graph, generates Nuxt configuration and installs Chromium.
The agent then runs the same commands described in the [development guide](./development.md).

This setup takes effect after it reaches the default branch. Observe a GitHub
workflow/session to verify remote execution; local checks alone do not prove it.
If setup fails, GitHub may continue with a partially prepared environment, so
inspect setup logs before diagnosing application failures. Availability also
depends on repository/organization settings and Copilot access.

## Maintenance

When changing conventions, update source, commands, CI, applicable instructions
and canonical docs together. Use quoted YAML descriptions and comma-separated
`applyTo` strings. Keep names aligned with skill folders. Add references for new
playbooks; fix links when paths move. Never change historical verification dates
without actually rechecking the cited source. Run focused checks, then the
relevant merge gates; report unavailable checks instead of claiming success.

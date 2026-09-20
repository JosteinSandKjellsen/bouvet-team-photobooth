# bouvet-team-photobooth

Nuxt 4/Vue frontend and Nitro backend in a pnpm monorepo, with a repository-local
GitHub Copilot harness. The current application is a health-check foundation:
there is no camera capture, paid generation, database, authentication or cloud
deployment yet. No environment variables or credentials are needed to run it.

## Quickstart

Use Node **24 LTS, at least 24.11.0**, and pnpm **12.5.1**. Select Node 24 with
a version manager for your OS: `fnm` supports Windows, Linux and macOS. On
Linux/macOS, `nvm install` and `nvm use` read [.nvmrc](.nvmrc); `nvm-windows`
requires explicit version arguments. The commands below work in PowerShell,
Command Prompt and POSIX shells. Install the pinned package manager if necessary:

```sh
npm install --global pnpm@12.5.1
pnpm install --frozen-lockfile
pnpm prepare
pnpm dev
```

Open <http://127.0.0.1:3000>. Use `pnpm dev --port 3001` if that port is occupied.
The API is `GET /api/health`, returning `{"status":"ok"}`. It is process liveness,
not database or provider readiness. The status screen includes failure and retry.

pnpm 12 settings, including engine enforcement and the dependency build-script
allowlist, live in [pnpm-workspace.yaml](pnpm-workspace.yaml), not `.npmrc`.
Review new install-script permissions before extending that allowlist.

## Layout

| Location                                 | Owns                                              |
| ---------------------------------------- | ------------------------------------------------- |
| [apps/web/app](apps/web/app)             | Vue UI and browser-safe composables               |
| [apps/web/server](apps/web/server)       | Nitro routes and server-only code                 |
| [packages/contracts](packages/contracts) | Private type-only public API DTOs                 |
| [.github](.github)                       | Copilot instructions, skills and GitHub workflows |
| [docs](docs)                             | Canonical feature playbooks and harness usage     |
| [scripts](scripts)                       | Harness validation and its regression tests       |

One app runs and deploys both frontend and backend. The contracts package is
consumed through `workspace:*` and erased at runtime. Nuxt owns its generated
TypeScript contexts; do not edit `.nuxt` or `.output`.

## Commands

Run these from the repository root:

| Command                             | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `pnpm prepare`                      | Generate Nuxt types and lint configuration             |
| `pnpm dev`                          | Start the single development server                    |
| `pnpm lint` / `pnpm lint:fix`       | Lint code and Markdown / apply fixes                   |
| `pnpm lint:code`                    | Check code and import boundaries with ESLint           |
| `pnpm lint:markdown`                | Check Markdown structure, including Copilot files      |
| `pnpm format` / `pnpm format:check` | Format / check maintained source and docs              |
| `pnpm typecheck`                    | Check contracts, Vue, server, tests and configurations |
| `pnpm test` / `pnpm test:watch`     | Run component and harness tests / watch components     |
| `pnpm check:harness`                | Validate metadata, scopes, commands and document links |
| `pnpm check`                        | Run formatting, lint, types, tests and harness checks  |
| `pnpm build` / `pnpm start`         | Build / run production Node/Nitro output               |
| `pnpm test:e2e`                     | Build once and run real API/browser tests              |

Prettier checks Markdown formatting; markdownlint checks structure. Both run in
`pnpm check`, including docs, instructions and skills. Markdown file discovery
lives in [.markdownlint-cli2.jsonc](.markdownlint-cli2.jsonc), so it does not depend
on shell glob expansion. Rule MD013 is disabled because Prettier owns wrapping;
other default Markdown rules remain enabled.

Before running browser tests:

```sh
pnpm --filter @bouvet-team-photobooth/web exec playwright install chromium
pnpm check
pnpm test:e2e
```

On Linux CI, browser installation also needs `--with-deps`. Playwright starts
its own production server on port 3100 and never reuses an existing service.
To choose another port:

- Bash/zsh: `E2E_PORT=3101 pnpm test:e2e`.
- PowerShell: `$env:E2E_PORT = '3101'; pnpm test:e2e`; clear afterward with
  `Remove-Item Env:E2E_PORT`.
- Command Prompt: `set "E2E_PORT=3101" && pnpm test:e2e`; clear afterward with
  `set "E2E_PORT="`.

The server stops when the tests finish. Reports, failure traces and screenshots are in
`apps/web/playwright-report` and `apps/web/test-results` and are ignored by Git.

The [CI workflow](.github/workflows/ci.yml) runs these checks on Windows, Linux
and macOS for pull requests and main-branch pushes. Requiring the matrix checks
for merges needs repository branch protection configured by an owner. A configured
matrix is not evidence of a successful run; inspect the results after pushing.
Production-build tests validate Node/Nitro, not the deferred Netlify-specific deployment.

Repository scripts must work on all three platforms. Prefer Node filesystem,
path and process APIs over shell utilities; see the
[cross-platform rules](.github/instructions/tooling.instructions.md#cross-platform-scripts).
[.gitattributes](.gitattributes) keeps text checkouts at LF, matching EditorConfig
and Prettier, including on Windows.

## Copilot Harness

Start with [AI development](docs/ai-development.md). Repository-wide instructions
define boundaries; five scoped instruction files guide matching work; three
skills cover implementation, debugging and verification. Executable checks
enforce quality, while instructions guide rather than guarantee agent behavior.

The [cloud-agent setup](.github/workflows/copilot-setup-steps.yml) installs the
same tools and Chromium on GitHub. It becomes active after reaching the default
branch; no remote workflow execution or repository settings are enabled by merely
creating this scaffold. For local editing, Vue - Official, ESLint and Prettier
VS Code extensions are useful; no global editor settings are changed.

## Future Features

These documents are approved baselines when their features are requested, not
permission to implement them as part of the health-check scaffold:

- [Camera and initial images](docs/camera-and-initial-image-playbook.md)
- [Leonardo integration](docs/leonardo-integration-playbook.md)
- [Prisma, data and jobs](docs/prisma-data-and-jobs-playbook.md)

PostgreSQL/Prisma, durable jobs and Netlify-first deployment are future targets;
Azure is a future migration option. Recheck dated package/provider claims at the
relevant milestone. Auth/ownership, retention policies, verified reconciliation
and any required provider erasure are explicit feature/launch gates.

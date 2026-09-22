# Development Guide

This guide owns local setup, commands and verification. Start with the
[README](../README.md) for the product overview and folder map, the
[implementation plan](./implementation-plan.md) for feature scope, and
[AI development](./ai-development.md) for Copilot harness usage.

## Prerequisites And Setup

Use Node **24 LTS, at least 24.15.0**, and pnpm **12.5.1**, matching the root
[manifest](../package.json). Select Node 24 with a version manager for your OS:
`fnm` supports Windows, Linux and macOS. On Linux/macOS, `nvm install` and
`nvm use` read [.nvmrc](../.nvmrc); `nvm-windows` requires explicit version
arguments. Install the pinned package manager if necessary:

```sh
npm install --global pnpm@12.5.1
```

Check `node --version` once after selecting the runtime. A command such as
`npx --package=node@24.15.0 -- node --version` is a temporary fallback, not a
runtime switch: it uses npm's cache when available but leaves the parent shell
on its previous Node version. Prefer a version manager over repeating that
wrapper around individual checks. When a version manager is unavailable, run a
root command through the portable shortcut instead, for example
`pnpm node:24 -- check` or `pnpm node:24 -- test:db`. It resolves Node 24.15.0,
confirms the selected executable, and passes that runtime to child `pnpm`
processes without changing the parent shell.

Run from the repository root. These commands work in PowerShell, Command Prompt
and POSIX shells:

```sh
pnpm install --frozen-lockfile
pnpm prepare
pnpm dev
```

Open <http://127.0.0.1:3000>. If that port is occupied, invoke Nuxt directly:
`pnpm --filter @bouvet-team-photobooth/web exec nuxt dev --host 127.0.0.1 --port 3001`.
Nested script forwarding treats `pnpm dev -- --port 3001` as a Nuxt project-path
argument rather than a port option. Set `NUXT_SESSION_ORIGIN` and
`LOCAL_GENERATION_WORKER_ORIGIN` to that same origin before using the private
capture flow on a custom port. The default M1 theme-selection shell requires no
environment variables or credentials; enabled M2-M4 features use the local
PostgreSQL and `.env` configuration below. `GET /api/health` returns
`{"status":"ok"}`: process liveness, not database or provider readiness.

## Local PostgreSQL

M3 persistence development and integration tests use local PostgreSQL through
Docker Compose. Docker Desktop or Docker Engine with the Compose plugin is
required. Copy the tracked environment template, then start the service:

```sh
cp .env.example .env
docker compose up -d postgres
docker compose ps
```

The service listens only on `127.0.0.1:54329`. It creates the `photobooth`
development database and the separate `photobooth_test` database for automated
tests. The example local credentials are intentionally non-secret and must not
be used outside a developer machine. Prisma commands use `DATABASE_URL`
for runtime traffic, `DIRECT_URL` for schema changes, and
`TEST_DATABASE_URL` only for isolated tests.

The local template also configures `NUXT_SESSION_MAX_ACTIVE` for anonymous
session admission and `NUXT_CLEANUP_WORKER_TOKEN` for the internal
`POST /api/internal/source-cleanup` sweep. The latter accepts a bearer token and
must be scheduled by the deployment platform; its local token and capacity are
not approved production values. Configure distinct secret and numeric values
before public use.

Browser capture-to-generation is disabled by default. It requires both
`NUXT_CAPTURE_GENERATION_ENABLED=true` on the server and
`NUXT_PUBLIC_CAPTURE_GENERATION_ENABLED=true` for the browser flow; the private
server flag remains the enforcement boundary. Do not enable either value for
participant images until the retention, disclosure and provider gates in the
[implementation plan](./implementation-plan.md) are approved. The isolated
database test runner enables both values only for its synthetic camera input.

For local synthetic-image testing, enable both flags in the ignored `.env` file
and run `pnpm local:worker` in a second terminal after `pnpm dev`. The worker
uses the existing authenticated internal endpoints to submit queued generations,
reconcile completed output, and process cleanup. It defaults to
`NUXT_SESSION_ORIGIN` and a two-second interval; set
`LOCAL_GENERATION_WORKER_ORIGIN` or
`LOCAL_GENERATION_WORKER_INTERVAL_MS` only when a different local target is
needed.

To exercise Leonardo locally, set `GENERATION_PROVIDER=leonardo`, supply an
approved local `LEONARDO_API_KEY`, and run the local worker. The worker polls the
authenticated v1 get-generation endpoint as a fallback, so localhost does not
require a public callback URL. To test the primary webhook path, also set a unique
`NUXT_LEONARDO_WEBHOOK_TOKEN` and configure a temporary public HTTPS callback at
`/api/internal/leonardo-completion` using that bearer token. This consumes
approved credits and is limited to synthetic images. The output remains private
and the browser redirects to the M5 placeholder page because public result
serving is not implemented yet.

Approved source images use the `local` storage driver by default and are written
under `apps/web/.local/sources`, which is ignored by Git. Netlify Blob storage
is only for hosted deployments: set `SOURCE_STORAGE_DRIVER=netlify` and provide
`SOURCE_STORAGE_BLOB_STORE_NAME` there. The application needs temporary storage
because an approved source may be processed asynchronously or retained for a
permitted retry; it does not require Blob storage for local development.

Run the PostgreSQL-backed HTTP tests with `pnpm test:db`. It refuses a database
name that does not end in `_test`, applies migrations only to that database,
builds the production Nitro server, and runs the session API tests.

Stop the local service with `docker compose down`. Its named volume preserves
local data; remove it only when a clean local database is needed:

```sh
docker compose down --volumes
```

On Windows, use PowerShell or Command Prompt equivalents to copy the template,
for example `Copy-Item .env.example .env`. The Compose commands are the same.

pnpm 12 settings, including engine enforcement and the dependency build-script
allowlist, live in [pnpm-workspace.yaml](../pnpm-workspace.yaml), not `.npmrc`.
Review new install-script permissions before extending that allowlist.

One app runs both frontend and backend. The contracts package is consumed through
`workspace:*` and erased at runtime. Nuxt owns generated TypeScript/lint contexts;
run `pnpm prepare` before checks and never edit `.nuxt` or `.output`.
For local editing, Vue - Official, ESLint and Prettier VS Code extensions are
useful; no global editor settings are required.

## Commands

Run these from the repository root:

| Command                             | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm prepare`                      | Generate Nuxt types and lint configuration.             |
| `pnpm dev`                          | Start the single development server.                    |
| `pnpm lint` / `pnpm lint:fix`       | Lint code and Markdown / apply fixes.                   |
| `pnpm lint:code`                    | Check code and import boundaries with ESLint.           |
| `pnpm lint:markdown`                | Check Markdown structure, including Copilot files.      |
| `pnpm format` / `pnpm format:check` | Format / check maintained source and docs.              |
| `pnpm node:24 -- <command>`         | Run a root pnpm command with temporary Node 24.15.0.    |
| `pnpm typecheck`                    | Check contracts, Vue, server, tests and configurations. |
| `pnpm test` / `pnpm test:watch`     | Run component and harness tests / watch components.     |
| `pnpm test:db`                      | Run database API tests against the local test database. |
| `pnpm deps:check`                   | Report outdated direct workspace packages.              |
| `pnpm deps:update`                  | Update direct packages to latest registry releases.     |
| `pnpm check:harness`                | Validate metadata, scopes, commands and document links. |
| `pnpm check`                        | Run formatting, lint, types, tests and harness checks.  |
| `pnpm build` / `pnpm start`         | Build / run production Node/Nitro output.               |
| `pnpm test:e2e`                     | Build once and run real API/browser tests.              |

Run focused checks while iterating and `pnpm check` before handoff. Application
behavior or build changes also require `pnpm test:e2e`. Report actual results and
explain skipped checks.

Prettier checks Markdown formatting; markdownlint checks structure. Both run in
`pnpm check`, including docs, instructions and skills. Markdown discovery lives
in [.markdownlint-cli2.jsonc](../.markdownlint-cli2.jsonc), independent of shell
glob expansion. MD013 is disabled because Prettier owns line wrapping; other
default Markdown rules remain enabled.

## Dependency Updates

Run `pnpm deps:check` before dependency work. Update outdated direct packages
with `pnpm deps:update`, inspect release and migration notes for major changes,
then run `pnpm peers check`, a focused check, and the relevant merge gates.
The portable update script reads the recursive audit, updates actionable direct
packages to their latest releases and retains the documented exceptions below.

TypeScript `7.0.2` is a current compatibility exception as of 2026-09-21:
`vue-tsc` fails because TypeScript no longer exports `./lib/tsc`, and the latest
`@typescript-eslint/parser` accepts TypeScript only below `6.1.0`. The workspace
therefore uses TypeScript `6.0.3`, the newest compatible stable release observed.
`@types/node` remains on `24.13.6`, the newest Node 24 type release, because the
workspace targets Node 24 rather than the registry-latest Node 26 type family.
These exceptions mean `pnpm deps:check` exits nonzero and reports both packages;
recheck them whenever the Node, Vue or ESLint toolchain changes.

## Browser Tests And Ports

Install Chromium before running browser tests:

```sh
pnpm --filter @bouvet-team-photobooth/web exec playwright install chromium
pnpm check
pnpm test:e2e
```

On Linux CI, browser installation also needs `--with-deps`. Playwright starts
its own fresh production server on port 3100 and never reuses an existing service.
To choose another port:

- Bash/zsh: `E2E_PORT=3101 pnpm test:e2e`.
- PowerShell: `$env:E2E_PORT = '3101'; pnpm test:e2e`; clear afterward with
  `Remove-Item Env:E2E_PORT`.
- Command Prompt: `set "E2E_PORT=3101" && pnpm test:e2e`; clear afterward with
  `set "E2E_PORT="`.

The server stops when tests finish. Reports, failure traces and screenshots are
in `apps/web/playwright-report` and `apps/web/test-results` and are ignored by Git.
Inspect them when diagnosing failures or verifying changed UI behavior.
Production-build tests validate Node/Nitro, not a future Netlify deployment.

## CI And Portability

The [CI workflow](../.github/workflows/ci.yml) runs quality gates and production
browser tests on Windows, Linux and macOS for pull requests and main-branch
pushes. Requiring matrix checks for merges needs branch protection configured
by an owner. A configured matrix is not proof of a successful run; inspect actual
results and report local and remote verification separately.

Repository scripts must work on all three platforms. Prefer Node filesystem,
path and process APIs over shell utilities; see the
[cross-platform rules](../.github/instructions/tooling.instructions.md#cross-platform-scripts).
[.gitattributes](../.gitattributes) keeps text checkouts at LF, matching
EditorConfig and Prettier, including on Windows.

The [cloud-agent setup](../.github/workflows/copilot-setup-steps.yml) installs the
same tools and Chromium on GitHub. It takes effect after reaching the default
branch; creating the file alone does not enable remote settings or prove a
successful session. See [AI development](./ai-development.md#github-cloud-agent)
for discovery and remote setup caveats.

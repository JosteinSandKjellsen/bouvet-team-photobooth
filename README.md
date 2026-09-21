# Bouvet Team Photobooth

A shared conference experience for groups visiting the Bouvet stand, on a kiosk
or phone. The planned app lets visitors choose a fictional team universe, take
and approve a group photo, then receive a recognizable AI-generated portrait
to share, download or print. A public event gallery shows completed pictures.
It is a playful team activity, not a personality assessment; privacy and photo
expiration are part of the journey.

Built as one Nuxt 4/Vue frontend and Nitro backend in a pnpm workspace, with
type-only shared API contracts. **Currently implemented: a health-check
foundation only.** Camera capture, generation, storage and deployment are planned;
the current app needs no credentials.

## Quickstart

Use Node **24 LTS, at least 24.11.0**, and pnpm **12.5.1**. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm prepare
pnpm dev
```

Open <http://127.0.0.1:3000>. See the [development guide](docs/development.md)
for tool installation, commands, ports and testing. Run `pnpm check` before
handoff, plus `pnpm test:e2e` for application or build changes.

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

## Documentation

| Guide                                                                  | Purpose                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Implementation plan](docs/implementation-plan.md)                     | Product brief, confirmed decisions, milestones and readiness gates.    |
| [Design](docs/design-playbook.md)                                      | Screen layouts, styling, copy, accessibility and visual checks.        |
| [Development](docs/development.md)                                     | Local setup, full command reference, browser tests and CI.             |
| [AI development](docs/ai-development.md)                               | Copilot instructions, skills, discovery and harness maintenance.       |
| [Camera and initial images](docs/camera-and-initial-image-playbook.md) | Capture, countdown, validation, compression and upload.                |
| [Leonardo integration](docs/leonardo-integration-playbook.md)          | Generation, completion, safe retries and provider cleanup constraints. |
| [Data and jobs](docs/prisma-data-and-jobs-playbook.md)                 | Persistence, durable work, retention and deployment baseline.          |

Playbooks guide their selected milestones; their existence does not mean a feature
is implemented or authorize starting it. Readiness and privacy gates remain explicit.

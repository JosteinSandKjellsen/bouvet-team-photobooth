import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const compatibilityExceptions = {
  '@netlify/blobs': '10.7.13',
  '@types/node': '24.19.2',
  prisma: '7.10.0',
  typescript: '6.0.3',
}

export const getPnpmCommand = (platform) =>
  platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function parseDependencyReport(audit, acceptedExitCodes = [0, 1]) {
  if (audit.error) throw audit.error
  if (!acceptedExitCodes.includes(audit.status) || !audit.stdout?.trim()) {
    throw new Error(
      audit.stderr?.trim() || 'Dependency audit returned no report',
    )
  }
  return JSON.parse(audit.stdout)
}

export function selectDependencyUpdates(
  report,
  exceptions,
  workspacePackages = [],
) {
  const candidates = { ...report }
  for (const workspacePackage of workspacePackages) {
    const dependencies = {
      ...workspacePackage.dependencies,
      ...workspacePackage.devDependencies,
      ...workspacePackage.optionalDependencies,
    }
    for (const [name, dependency] of Object.entries(dependencies)) {
      const exception = exceptions[name]
      if (exception && dependency.version !== exception) {
        candidates[name] = { current: dependency.version, latest: exception }
      }
    }
  }

  return Object.entries(candidates)
    .filter(([name, dependency]) => {
      const exception = exceptions[name]
      return exception
        ? dependency.current !== exception
        : dependency.current !== dependency.latest
    })
    .map(([name]) => `${name}@${exceptions[name] ?? 'latest'}`)
    .sort()
}

function runPnpm(args, options = {}) {
  return spawnSync(getPnpmCommand(process.platform), args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  })
}

function main() {
  const audit = runPnpm(['outdated', '--recursive', '--format', 'json'])
  const report = parseDependencyReport(audit)
  const inventory = runPnpm(['list', '--recursive', '--depth', '0', '--json'])
  const workspacePackages = parseDependencyReport(inventory, [0])
  const updates = selectDependencyUpdates(
    report,
    compatibilityExceptions,
    workspacePackages,
  )
  if (!updates.length) {
    console.log('Direct packages are current; documented exceptions retained.')
    return
  }

  const update = runPnpm(['update', '--recursive', ...updates], {
    stdio: 'inherit',
  })
  if (update.error) throw update.error
  process.exitCode = update.status ?? 1
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main()
}

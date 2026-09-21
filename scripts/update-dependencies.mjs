import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const compatibilityExceptions = {
  '@types/node': '24.13.6',
  typescript: '6.0.3',
}

export function selectDependencyUpdates(report, exceptions) {
  return Object.entries(report)
    .filter(([name, dependency]) => {
      const exception = exceptions[name]
      return exception
        ? dependency.current !== exception
        : dependency.current !== dependency.latest
    })
    .map(([name]) => (exceptions[name] ? `${name}@${exceptions[name]}` : name))
    .sort()
}

function runPnpm(args, options = {}) {
  const pnpmCli = process.env.npm_execpath
  if (!pnpmCli) throw new Error('Run this script through pnpm deps:update')
  return spawnSync(process.execPath, [pnpmCli, ...args], {
    encoding: 'utf8',
    ...options,
  })
}

function main() {
  const audit = runPnpm(['outdated', '--recursive', '--format', 'json'])
  if (![0, 1].includes(audit.status ?? -1)) {
    process.stderr.write(audit.stderr)
    process.exitCode = audit.status ?? 1
    return
  }

  const report = audit.stdout.trim() ? JSON.parse(audit.stdout) : {}
  const updates = selectDependencyUpdates(report, compatibilityExceptions)
  if (!updates.length) {
    console.log('Direct packages are current; documented exceptions retained.')
    return
  }

  const update = runPnpm(['update', '--latest', '--recursive', ...updates], {
    stdio: 'inherit',
  })
  process.exitCode = update.status ?? 1
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main()
}

import { spawnSync } from 'node:child_process'
import { delimiter, dirname, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeVersion = '24.15.0'

export const getNpxCommand = (platform) =>
  platform === 'win32' ? 'npx.cmd' : 'npx'

export const getPnpmCommand = (platform) =>
  platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function getNode24ProbeArgs() {
  return [
    '--yes',
    `--package=node@${nodeVersion}`,
    '--',
    'node',
    '-p',
    'process.execPath',
  ]
}

export function prependNodePath(
  environment,
  nodePath,
  pathDelimiter = delimiter,
) {
  const pathKey = Object.keys(environment).find(
    (key) => key.toUpperCase() === 'PATH',
  )
  const existingPath = pathKey ? environment[pathKey] : undefined
  const nodeDirectory = nodePath.includes('\\')
    ? win32.dirname(nodePath)
    : dirname(nodePath)

  return {
    ...environment,
    [pathKey ?? 'PATH']: existingPath
      ? `${nodeDirectory}${pathDelimiter}${existingPath}`
      : nodeDirectory,
  }
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function main() {
  const pnpmArguments = process.argv.slice(2)
  if (pnpmArguments[0] === '--') pnpmArguments.shift()
  if (pnpmArguments.length === 0) {
    fail('Usage: pnpm node:24 -- <pnpm command>')
    return
  }

  const probe = spawnSync(
    getNpxCommand(process.platform),
    getNode24ProbeArgs(),
    { encoding: 'utf8' },
  )
  if (probe.error || probe.status !== 0) {
    fail('Unable to resolve Node 24.15.0')
    return
  }

  const nodePath = probe.stdout.trim()
  const version = spawnSync(nodePath, ['--version'], { encoding: 'utf8' })
  if (
    version.error ||
    version.status !== 0 ||
    !version.stdout.startsWith('v24.')
  ) {
    fail('Unable to select Node 24')
    return
  }

  const result = spawnSync(getPnpmCommand(process.platform), pnpmArguments, {
    env: prependNodePath(process.env, nodePath),
    stdio: 'inherit',
  })
  if (result.error) {
    fail('Unable to run pnpm with Node 24')
    return
  }

  process.exitCode = result.status ?? 1
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const getPnpmCommand = (platform) =>
  platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function getLocalDebugProcesses(nodeExecutable, platform) {
  return [
    {
      args: ['dev'],
      command: getPnpmCommand(platform),
      name: 'Nuxt development server',
      shell: platform === 'win32',
    },
    {
      args: [
        '--env-file-if-exists=.env',
        'scripts/run-local-generation-worker.mjs',
      ],
      command: nodeExecutable,
      name: 'Local generation worker',
      shell: false,
    },
  ]
}

function main() {
  const children = []
  let shuttingDown = false

  const shutdown = (exitCode = 0, signal = 'SIGTERM') => {
    if (shuttingDown) return
    shuttingDown = true
    process.exitCode = exitCode
    for (const child of children) {
      if (!child.closed) child.process.kill(signal)
    }
  }

  for (const definition of getLocalDebugProcesses(
    process.execPath,
    process.platform,
  )) {
    console.info(`Starting ${definition.name}`)
    const child = spawn(definition.command, definition.args, {
      cwd: root,
      shell: definition.shell,
      stdio: 'inherit',
    })
    const entry = { closed: false, process: child }
    children.push(entry)

    child.once('error', (error) => {
      console.error(`Unable to start ${definition.name}: ${error.message}`)
      shutdown(1)
    })
    child.once('close', (code, signal) => {
      entry.closed = true
      if (!shuttingDown) {
        shutdown(code ?? (signal ? 1 : 0))
      }
    })
  }

  process.once('SIGINT', () => shutdown(130, 'SIGINT'))
  process.once('SIGTERM', () => shutdown(143, 'SIGTERM'))
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}

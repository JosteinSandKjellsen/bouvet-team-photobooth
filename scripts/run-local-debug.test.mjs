import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalDebugProcesses, getPnpmCommand } from './run-local-debug.mjs'

test('uses the platform-specific pnpm command', () => {
  assert.equal(getPnpmCommand('darwin'), 'pnpm')
  assert.equal(getPnpmCommand('linux'), 'pnpm')
  assert.equal(getPnpmCommand('win32'), 'pnpm.cmd')
})

test('starts the server and worker with portable process arguments', () => {
  assert.deepEqual(getLocalDebugProcesses('/node', 'linux'), [
    {
      args: ['dev'],
      command: 'pnpm',
      name: 'Nuxt development server',
      shell: false,
    },
    {
      args: [
        '--env-file-if-exists=.env',
        'scripts/run-local-generation-worker.mjs',
      ],
      command: '/node',
      name: 'Local generation worker',
      shell: false,
    },
  ])
  assert.equal(getLocalDebugProcesses('node.exe', 'win32')[0].shell, true)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { getPnpmCommand } from './test-database.mjs'
import {
  getNode24ProbeArgs,
  getNpxCommand,
  prependNodePath,
} from './run-node24.mjs'

test('selects the portable pnpm command for each platform', () => {
  assert.equal(getPnpmCommand('win32'), 'pnpm.cmd')
  assert.equal(getPnpmCommand('darwin'), 'pnpm')
  assert.equal(getPnpmCommand('linux'), 'pnpm')
})

test('resolves Node 24 with the portable npx command', () => {
  assert.equal(getNpxCommand('win32'), 'npx.cmd')
  assert.equal(getNpxCommand('darwin'), 'npx')
  assert.deepEqual(getNode24ProbeArgs(), [
    '--yes',
    '--package=node@24.15.0',
    '--',
    'node',
    '-p',
    'process.execPath',
  ])
})

test('prepends the selected Node binary directory to PATH', () => {
  assert.deepEqual(
    prependNodePath({ PATH: '/usr/bin' }, '/cache/node/bin/node', ':'),
    { PATH: '/cache/node/bin:/usr/bin' },
  )
  assert.deepEqual(
    prependNodePath({ Path: 'C:\\Windows' }, 'C:\\cache\\node.exe', ';'),
    { Path: 'C:\\cache;C:\\Windows' },
  )
})

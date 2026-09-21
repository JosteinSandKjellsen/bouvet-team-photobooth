import assert from 'node:assert/strict'
import test from 'node:test'
import { getPnpmCommand } from './test-database.mjs'

test('selects the portable pnpm command for each platform', () => {
  assert.equal(getPnpmCommand('win32'), 'pnpm.cmd')
  assert.equal(getPnpmCommand('darwin'), 'pnpm')
  assert.equal(getPnpmCommand('linux'), 'pnpm')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compatibilityExceptions,
  getPnpmCommand,
  parseDependencyReport,
  selectDependencyUpdates,
} from './update-dependencies.mjs'

test('launches pnpm as a command rather than executing its native binary through Node', () => {
  assert.equal(getPnpmCommand('darwin'), 'pnpm')
  assert.equal(getPnpmCommand('linux'), 'pnpm')
  assert.equal(getPnpmCommand('win32'), 'pnpm.cmd')
})

test('accepts an outdated audit with exit code one and a JSON report', () => {
  const report = { nuxt: { current: '4.5.2', latest: '4.6.1' } }
  assert.deepEqual(
    parseDependencyReport({ status: 1, stdout: JSON.stringify(report) }),
    report,
  )
  assert.deepEqual(parseDependencyReport({ status: 0, stdout: '{}' }), {})
})

test('does not report current packages when the audit process fails', () => {
  assert.throws(
    () =>
      parseDependencyReport({
        status: 1,
        stdout: '',
        stderr: 'SyntaxError: Invalid or unexpected token',
      }),
    /SyntaxError/,
  )
  assert.throws(
    () => parseDependencyReport({ status: 0, stdout: '' }),
    /Dependency audit returned no report/,
  )
  assert.throws(
    () => parseDependencyReport({ error: new Error('spawn pnpm ENOENT') }),
    /ENOENT/,
  )
})

test('updates outdated packages and retains compatible exceptions', () => {
  const report = {
    '@netlify/blobs': { current: '10.7.13', latest: '11.1.4' },
    '@types/node': { current: '24.19.2', latest: '26.6.5' },
    markdownlint: { current: '1.0.0', latest: '1.1.0' },
    prisma: { current: '7.10.0', latest: '8.0.0-rc.22' },
    typescript: { current: '6.0.3', latest: '7.0.2' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    'markdownlint@latest',
  ])
})

test('updates Node 24 types without adopting the latest Node major', () => {
  const report = {
    '@types/node': { current: '24.13.6', latest: '26.6.5' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    '@types/node@24.19.2',
  ])
})

test('restores stable Prisma when the CLI drifts to a release candidate', () => {
  const report = {
    prisma: { current: '8.0.0-rc.22', latest: '8.0.0-rc.22' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    'prisma@7.10.0',
  ])
})

test('repairs a documented exception that drifted from its compatible pin', () => {
  const report = {
    '@netlify/blobs': { current: '11.1.4', latest: '11.1.4' },
    typescript: { current: '7.0.2', latest: '7.0.2' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    '@netlify/blobs@10.7.13',
    'typescript@6.0.3',
  ])
})

test('repairs incompatible latest packages omitted by the outdated audit', () => {
  const packages = [
    {
      dependencies: { '@netlify/blobs': { version: '11.1.4' } },
      devDependencies: { typescript: { version: '7.0.2' } },
    },
    { devDependencies: { typescript: { version: '6.0.3' } } },
  ]

  assert.deepEqual(
    selectDependencyUpdates({}, compatibilityExceptions, packages),
    ['@netlify/blobs@10.7.13', 'typescript@6.0.3'],
  )
  assert.deepEqual(
    selectDependencyUpdates({}, compatibilityExceptions, [packages[1]]),
    [],
  )
})

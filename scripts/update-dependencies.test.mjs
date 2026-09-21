import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compatibilityExceptions,
  selectDependencyUpdates,
} from './update-dependencies.mjs'

test('updates outdated packages and retains compatible exceptions', () => {
  const report = {
    '@types/node': { current: '24.13.6', latest: '26.6.2' },
    markdownlint: { current: '1.0.0', latest: '1.1.0' },
    typescript: { current: '6.0.3', latest: '7.0.2' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    'markdownlint',
  ])
})

test('repairs a documented exception that drifted from its compatible pin', () => {
  const report = {
    typescript: { current: '7.0.2', latest: '7.0.2' },
  }

  assert.deepEqual(selectDependencyUpdates(report, compatibilityExceptions), [
    'typescript@6.0.3',
  ])
})

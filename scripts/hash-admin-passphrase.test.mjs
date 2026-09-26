import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import test from 'node:test'
import { hashAdminPassphrase } from './hash-admin-passphrase.mjs'

test('creates a salted hash using the server verification parameters', () => {
  const phrase = 'synthetic-only administrator phrase'
  const hash = hashAdminPassphrase(phrase)
  assert.match(hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/)
  assert.notEqual(hash, hashAdminPassphrase(phrase))
  const [, salt, key] = hash.split(':')
  assert.equal(
    key,
    scryptSync(phrase, salt, 64, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    }).toString('hex'),
  )
  assert.equal(hash.includes(phrase), false)
})

test('requires at least eight characters without echoing rejected input', () => {
  assert.throws(() => hashAdminPassphrase('short'))
  assert.doesNotThrow(() => hashAdminPassphrase('eight!!!'))
  assert.throws(() => hashAdminPassphrase('a'.repeat(513)))
})

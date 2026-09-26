import { scryptSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../server/utils/db', () => ({ db: {} }))
const { verifyAdminPassphrase, hashAdminToken, adminTokenPattern } =
  await import('../../server/utils/admin-sessions')

describe('admin credentials', () => {
  it('verifies the salted passphrase without accepting the stored hash as a password', async () => {
    const salt = '0123456789abcdef0123456789abcdef'
    const hash = `scrypt:${salt}:${scryptSync('synthetic admin phrase', salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`
    await expect(
      verifyAdminPassphrase('synthetic admin phrase', hash),
    ).resolves.toBe(true)
    await expect(verifyAdminPassphrase('wrong phrase', hash)).resolves.toBe(
      false,
    )
    await expect(verifyAdminPassphrase(hash, hash)).resolves.toBe(false)
  })

  it('uses fixed-size hashes and rejects malformed page capabilities', () => {
    expect(hashAdminToken('page-token')).toHaveLength(64)
    expect(hashAdminToken('page-token')).not.toBe(
      hashAdminToken('another-token'),
    )
    expect(adminTokenPattern.test('a'.repeat(43))).toBe(true)
    expect(adminTokenPattern.test('a'.repeat(44))).toBe(false)
    expect(adminTokenPattern.test('../image')).toBe(false)
  })
})

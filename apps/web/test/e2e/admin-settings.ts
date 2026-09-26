import { scryptSync } from 'node:crypto'

export const adminTestPassphrase = 'synthetic-only administrator phrase'
const salt = '0123456789abcdef0123456789abcdef'
export const adminTestHash = `scrypt:${salt}:${scryptSync(
  adminTestPassphrase,
  salt,
  64,
  {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  },
).toString('hex')}`

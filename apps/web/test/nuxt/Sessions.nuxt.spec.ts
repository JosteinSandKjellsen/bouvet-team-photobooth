import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    session: { count: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../../server/utils/db', () => ({ db }))

const { createSession } = await import('../../server/utils/sessions')

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((operation) => operation(db))
})

describe('createSession', () => {
  it('retries a transient serialization conflict', async () => {
    db.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce((operation) => operation(db))
    db.session.count.mockResolvedValue(0)
    db.session.create.mockResolvedValue({
      expiresAt: new Date('2026-09-21T20:05:00.000Z'),
      themeId: 'samurai',
    })

    await expect(createSession('samurai', 300_000, 3)).resolves.toMatchObject({
      session: { themeId: 'samurai' },
    })
    expect(db.$transaction).toHaveBeenCalledTimes(2)
  })

  it('rejects new sessions after the configured active-session limit', async () => {
    db.session.count.mockResolvedValue(3)

    await expect(createSession('samurai', 300_000, 3)).rejects.toMatchObject({
      statusCode: 429,
    })

    expect(db.session.create).not.toHaveBeenCalled()
  })
})

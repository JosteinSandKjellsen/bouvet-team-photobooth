import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCaptureCountdown } from '~/composables/useCaptureCountdown'

afterEach(() => vi.useRealTimers())

describe('useCaptureCountdown', () => {
  it('captures once at or after the three-second deadline', () => {
    vi.useFakeTimers()
    let now = 0
    const onComplete = vi.fn()
    const countdown = useCaptureCountdown({ clock: () => now, onComplete })

    expect(countdown.start()).toBe(true)
    expect(countdown.remainingSeconds.value).toBe(3)
    now = 999
    vi.advanceTimersByTime(1_000)
    expect(countdown.remainingSeconds.value).toBe(3)
    expect(onComplete).not.toHaveBeenCalled()

    now = 1_000
    vi.advanceTimersByTime(1)
    expect(countdown.remainingSeconds.value).toBe(2)
    now = 2_000
    vi.advanceTimersByTime(1_000)
    expect(countdown.remainingSeconds.value).toBe(1)
    now = 3_000
    vi.advanceTimersByTime(1_000)

    expect(onComplete).toHaveBeenCalledOnce()
    expect(countdown.isCountingDown.value).toBe(false)
  })

  it('does not start a second countdown while one is active', () => {
    vi.useFakeTimers()
    let now = 0
    const onComplete = vi.fn()
    const countdown = useCaptureCountdown({ clock: () => now, onComplete })

    expect(countdown.start()).toBe(true)
    expect(countdown.start()).toBe(false)
    now = 3_000
    vi.advanceTimersByTime(3_000)

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('cancels without taking a delayed picture', () => {
    vi.useFakeTimers()
    let now = 0
    const onComplete = vi.fn()
    const countdown = useCaptureCountdown({ clock: () => now, onComplete })

    countdown.start()
    countdown.cancel()
    now = 3_000
    vi.advanceTimersByTime(3_000)

    expect(onComplete).not.toHaveBeenCalled()
    expect(countdown.isCountingDown.value).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalCameraCapture } from '~/composables/useLocalCameraCapture'

const getUserMedia = vi.fn()
const stop = vi.fn()
let onEnded: (() => void) | undefined

const track = {
  addEventListener: vi.fn((event: string, callback: () => void) => {
    if (event === 'ended') {
      onEnded = callback
    }
  }),
  stop,
}
const stream = {
  getTracks: vi.fn(() => [track]),
  getVideoTracks: vi.fn(() => [track]),
}

beforeEach(() => {
  vi.clearAllMocks()
  onEnded = undefined
  getUserMedia.mockResolvedValue(stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('useLocalCameraCapture', () => {
  it('requests the camera only after activation and stops it on reset', async () => {
    const camera = useLocalCameraCapture()

    expect(getUserMedia).not.toHaveBeenCalled()
    await expect(camera.activate()).resolves.toBe(true)
    expect(camera.state.value).toBe('streaming')
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        height: { ideal: 720 },
        width: { ideal: 1280 },
      },
    })

    camera.reset()
    expect(stop).toHaveBeenCalledOnce()
    expect(camera.state.value).toBe('idle')
  })

  it('retries with baseline constraints after detailed constraints are rejected', async () => {
    getUserMedia
      .mockRejectedValueOnce(
        new DOMException('Unsupported', 'OverconstrainedError'),
      )
      .mockResolvedValueOnce(stream)
    const camera = useLocalCameraCapture()

    await expect(camera.activate()).resolves.toBe(true)

    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: true })
    expect(camera.state.value).toBe('streaming')
  })

  it('returns to a recoverable error state when the active track ends', async () => {
    const camera = useLocalCameraCapture()
    await camera.activate()

    onEnded?.()

    expect(stop).toHaveBeenCalledOnce()
    expect(camera.error.value).toBe('cameraUnavailable')
    expect(camera.state.value).toBe('error')
  })
})

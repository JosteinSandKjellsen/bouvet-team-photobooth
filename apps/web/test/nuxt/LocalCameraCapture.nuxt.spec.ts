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
        height: { ideal: 1080 },
        width: { ideal: 1920 },
      },
    })

    camera.reset()
    expect(stop).toHaveBeenCalledOnce()
    expect(camera.state.value).toBe('idle')
  })

  it('automatically starts only when camera permission is already granted', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' })
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query },
    })
    const camera = useLocalCameraCapture()

    await expect(camera.activateIfPermissionGranted()).resolves.toBe(true)

    expect(query).toHaveBeenCalledWith({ name: 'camera' })
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(camera.state.value).toBe('streaming')
  })

  it('keeps the camera idle when permission has not been granted', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'prompt' })
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query },
    })
    const camera = useLocalCameraCapture()

    await expect(camera.activateIfPermissionGranted()).resolves.toBe(false)

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(camera.state.value).toBe('idle')
  })

  it('offers camera switching only when multiple video inputs are available', async () => {
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        { kind: 'videoinput' },
        { kind: 'videoinput' },
        { kind: 'audioinput' },
      ])
    vi.stubGlobal('navigator', {
      mediaDevices: { enumerateDevices, getUserMedia },
    })
    const camera = useLocalCameraCapture()

    await camera.activate()

    expect(enumerateDevices).toHaveBeenCalledOnce()
    expect(camera.canSwitchCamera.value).toBe(true)
  })

  it('hides camera switching when device enumeration is unavailable', async () => {
    const camera = useLocalCameraCapture()

    await camera.activate()

    expect(camera.canSwitchCamera.value).toBe(false)
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

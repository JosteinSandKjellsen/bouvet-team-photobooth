import { computed, ref } from 'vue'

const MAX_PROCESSED_DIMENSION = 1_920
const TARGET_BYTES = 4_000_000

export type CameraError =
  | 'cameraInUse'
  | 'cameraUnavailable'
  | 'imageTooLarge'
  | 'permissionDenied'
  | 'unsupportedMedia'

export type CameraState =
  | 'idle'
  | 'requestingPermission'
  | 'streaming'
  | 'capturing'
  | 'compressing'
  | 'previewing'
  | 'error'

function getCameraError(error: unknown): CameraError {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'permissionDenied'
    }
    if (error.name === 'NotReadableError') {
      return 'cameraInUse'
    }
  }

  return 'cameraUnavailable'
}

function getProcessedDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_PROCESSED_DIMENSION / Math.max(width, height))
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function encodeJpeg(canvas: HTMLCanvasElement) {
  let workingCanvas = canvas
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const quality of [0.92, 0.85, 0.75, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        workingCanvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (blob && blob.size <= TARGET_BYTES) {
        return blob
      }
    }

    const width = Math.max(1, Math.floor(workingCanvas.width * 0.8))
    const height = Math.max(1, Math.floor(workingCanvas.height * 0.8))
    if (width === workingCanvas.width && height === workingCanvas.height) {
      break
    }
    const resizedCanvas = createCanvas(width, height)
    const context = resizedCanvas.getContext('2d')
    if (!context) {
      return null
    }
    context.drawImage(workingCanvas, 0, 0, width, height)
    workingCanvas = resizedCanvas
  }

  return null
}

export function useLocalCameraCapture() {
  const availableVideoInputCount = ref(0)
  const error = ref<CameraError | null>(null)
  const previewUrl = ref<string | null>(null)
  const source = ref<Blob | null>(null)
  const state = ref<CameraState>('idle')
  const facingMode = ref<'user' | 'environment'>('user')
  let stream: MediaStream | null = null

  const isCameraSupported = computed(
    () =>
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      window.isSecureContext,
  )
  const canSwitchCamera = computed(() => availableVideoInputCount.value > 1)

  function clearPreview() {
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    source.value = null
  }

  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }

  function reset() {
    stopStream()
    clearPreview()
    availableVideoInputCount.value = 0
    error.value = null
    state.value = 'idle'
  }

  function stop() {
    stopStream()
    if (state.value === 'streaming' || state.value === 'requestingPermission') {
      state.value = 'idle'
    }
  }

  async function detectAvailableVideoInputs() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices?.()
      availableVideoInputCount.value =
        devices?.filter((device) => device.kind === 'videoinput').length ?? 0
    } catch {
      availableVideoInputCount.value = 0
    }
  }

  async function activate(nextFacingMode = facingMode.value) {
    clearPreview()
    stopStream()
    error.value = null

    if (!isCameraSupported.value) {
      error.value = 'unsupportedMedia'
      state.value = 'error'
      return false
    }

    state.value = 'requestingPermission'
    try {
      const preferredConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: nextFacingMode },
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints)
      } catch (captureError) {
        if (
          !(captureError instanceof DOMException) ||
          captureError.name !== 'OverconstrainedError'
        ) {
          throw captureError
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        })
      }
      facingMode.value = nextFacingMode
      await detectAvailableVideoInputs()
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (state.value === 'streaming') {
            stopStream()
            error.value = 'cameraUnavailable'
            state.value = 'error'
          }
        })
      })
      state.value = 'streaming'
      return true
    } catch (captureError) {
      stream = null
      error.value = getCameraError(captureError)
      state.value = 'error'
      return false
    }
  }

  async function activateIfPermissionGranted() {
    if (!isCameraSupported.value || state.value !== 'idle') {
      return false
    }

    try {
      const permission = await navigator.permissions?.query({
        name: 'camera' as PermissionName,
      })
      if (permission?.state !== 'granted') {
        return false
      }
    } catch {
      return false
    }

    return activate()
  }

  async function connectVideo(video: HTMLVideoElement | null) {
    if (!video || !stream) {
      return
    }

    video.srcObject = stream
    try {
      await video.play()
    } catch {
      error.value = 'cameraUnavailable'
      state.value = 'error'
      stopStream()
    }
  }

  function usePreview(blob: Blob) {
    clearPreview()
    source.value = blob
    previewUrl.value = URL.createObjectURL(blob)
    state.value = 'previewing'
  }

  async function capture(video: HTMLVideoElement) {
    if (
      state.value !== 'streaming' ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      error.value = 'cameraUnavailable'
      state.value = 'error'
      return false
    }

    state.value = 'capturing'
    const dimensions = getProcessedDimensions(
      video.videoWidth,
      video.videoHeight,
    )
    const canvas = createCanvas(dimensions.width, dimensions.height)
    const context = canvas.getContext('2d')
    if (!context) {
      error.value = 'cameraUnavailable'
      state.value = 'error'
      return false
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    state.value = 'compressing'
    const blob = await encodeJpeg(canvas)
    if (!blob) {
      error.value = 'imageTooLarge'
      state.value = 'error'
      return false
    }

    stopStream()
    usePreview(blob)
    return true
  }

  return {
    activate,
    activateIfPermissionGranted,
    canSwitchCamera,
    capture,
    connectVideo,
    error,
    facingMode,
    isCameraSupported,
    previewUrl,
    reset,
    source,
    state,
    stop,
  }
}

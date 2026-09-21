import { computed, ref } from 'vue'

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DECODED_PIXELS = 24_000_000
const MAX_DIMENSION = 8_192
const MAX_INBOUND_BYTES = 20 * 1024 * 1024
const MAX_PROCESSED_DIMENSION = 1_600
const TARGET_BYTES = 4_000_000

export type CameraError =
  | 'cameraInUse'
  | 'cameraUnavailable'
  | 'imageTooLarge'
  | 'permissionDenied'
  | 'invalidImage'
  | 'unsupportedFile'
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
    for (const quality of [0.85, 0.75, 0.65, 0.5]) {
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

async function decodeImage(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image decoding failed'))
      image.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function useLocalCameraCapture() {
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
    error.value = null
    state.value = 'idle'
  }

  function stop() {
    stopStream()
    if (state.value === 'streaming' || state.value === 'requestingPermission') {
      state.value = 'idle'
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
          height: { ideal: 720 },
          width: { ideal: 1280 },
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

  async function selectFile(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      error.value = 'unsupportedFile'
      state.value = 'error'
      return false
    }
    if (file.size > MAX_INBOUND_BYTES) {
      error.value = 'imageTooLarge'
      state.value = 'error'
      return false
    }

    state.value = 'compressing'
    try {
      const image = await decodeImage(file)
      if (
        image.naturalWidth === 0 ||
        image.naturalHeight === 0 ||
        image.naturalWidth > MAX_DIMENSION ||
        image.naturalHeight > MAX_DIMENSION ||
        image.naturalWidth * image.naturalHeight > MAX_DECODED_PIXELS
      ) {
        error.value = 'imageTooLarge'
        state.value = 'error'
        return false
      }

      const dimensions = getProcessedDimensions(
        image.naturalWidth,
        image.naturalHeight,
      )
      const canvas = createCanvas(dimensions.width, dimensions.height)
      const context = canvas.getContext('2d')
      if (!context) {
        error.value = 'invalidImage'
        state.value = 'error'
        return false
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await encodeJpeg(canvas)
      if (!blob) {
        error.value = 'imageTooLarge'
        state.value = 'error'
        return false
      }

      stopStream()
      error.value = null
      usePreview(blob)
      return true
    } catch {
      error.value = 'invalidImage'
      state.value = 'error'
      return false
    }
  }

  return {
    activate,
    capture,
    connectVideo,
    error,
    facingMode,
    isCameraSupported,
    previewUrl,
    reset,
    selectFile,
    source,
    state,
    stop,
  }
}

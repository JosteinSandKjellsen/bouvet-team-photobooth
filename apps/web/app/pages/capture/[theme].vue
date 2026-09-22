<script setup lang="ts">
import type {
  GenerationAcceptedResponse,
  GenerationStatusResponse,
  ThemesResponse,
} from '@bouvet-team-photobooth/contracts'
import { Camera, RotateCcw, SwitchCamera } from '@lucide/vue'
import { themeMessages } from '~/utils/themeMessages'

defineOptions({ name: 'ThemeCapturePage' })

const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch<ThemesResponse>('/api/themes')
const { public: publicConfig } = useRuntimeConfig()
const selectedTheme = computed(() =>
  data.value?.themes.find((theme) => theme.id === route.params.theme),
)
const camera = useLocalCameraCapture()
const videoElement = ref<HTMLVideoElement | null>(null)
const videoReady = ref(false)
const locallyApproved = ref(false)
const recoveringGeneration = ref(false)
const submissionError = ref(false)
const submitting = ref(false)
const generationStatus = ref<GenerationStatusResponse['status'] | null>(null)
const captureGenerationEnabled = computed(
  () => String(publicConfig.captureGenerationEnabled) === 'true',
)
let pollTimer: ReturnType<typeof setTimeout> | undefined
let isActive = true
const countdown = useCaptureCountdown({
  onComplete: () => void captureImage(),
})

watch(videoElement, (video) => void camera.connectVideo(video))

function startCamera() {
  clearGenerationState()
  locallyApproved.value = false
  videoReady.value = false
  void camera.activate()
}

function switchCamera() {
  videoReady.value = false
  const nextFacingMode =
    camera.facingMode.value === 'user' ? 'environment' : 'user'
  void camera.activate(nextFacingMode)
}

function startCountdown() {
  if (!videoReady.value || !videoElement.value) {
    return
  }
  countdown.start()
}

function markVideoReady(event: Event) {
  const video = event.currentTarget
  videoReady.value =
    video instanceof HTMLVideoElement &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
}

async function captureImage() {
  if (!videoElement.value || document.hidden) {
    countdown.cancel()
    return
  }
  await camera.capture(videoElement.value)
}

function cancelCountdownOnHiddenTab() {
  if (document.hidden) {
    countdown.cancel()
  }
}

function retake() {
  clearGenerationState()
  locallyApproved.value = false
  camera.reset()
  startCamera()
}

function clearGenerationState() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
  generationStatus.value = null
  submissionError.value = false
  submitting.value = false
}

function schedulePoll() {
  if (pollTimer) {
    clearTimeout(pollTimer)
  }
  if (
    !isActive ||
    generationStatus.value === 'failed' ||
    generationStatus.value === 'succeeded'
  ) {
    return
  }

  pollTimer = setTimeout(() => void loadGenerationStatus(), 2_000)
}

async function loadGenerationStatus(silent = false) {
  try {
    const generation = await $fetch<GenerationStatusResponse>(
      '/api/sessions/current/generation',
    )
    if (!isActive) {
      return
    }

    locallyApproved.value = true
    generationStatus.value = generation.status
    submissionError.value = false

    if (generation.status === 'succeeded' && generation.resultPath) {
      await navigateTo(generation.resultPath)
      return
    }
    schedulePoll()
  } catch {
    if (!isActive || silent) {
      return
    }

    submissionError.value = true
    if (locallyApproved.value) {
      pollTimer = setTimeout(() => void loadGenerationStatus(), 2_000)
    }
  }
}

async function resumeGeneration() {
  if (!captureGenerationEnabled.value) {
    return
  }

  recoveringGeneration.value = true
  await loadGenerationStatus(true)
  if (isActive) {
    recoveringGeneration.value = false
  }
}

async function approvePicture() {
  const source = camera.source.value
  const theme = selectedTheme.value
  if (!source || !theme || submitting.value) {
    return
  }

  if (!captureGenerationEnabled.value) {
    locallyApproved.value = true
    return
  }

  submitting.value = true
  submissionError.value = false

  try {
    await $fetch('/api/sessions', {
      body: { themeId: theme.id },
      method: 'POST',
    })
    const formData = new FormData()
    formData.set('image', source, 'capture.jpg')
    await $fetch('/api/sessions/current/capture', {
      body: formData,
      method: 'POST',
    })
    locallyApproved.value = true
    const generation = await $fetch<GenerationStatusResponse>(
      '/api/sessions/current/generate',
      { method: 'POST' },
    )
    generationStatus.value = generation.status
    schedulePoll()
  } catch {
    submissionError.value = true
    if (locallyApproved.value) {
      schedulePoll()
    }
  } finally {
    submitting.value = false
  }
}

async function retryGeneration() {
  if (submitting.value || generationStatus.value !== 'failed') {
    return
  }

  submitting.value = true
  submissionError.value = false
  try {
    const generation = await $fetch<GenerationAcceptedResponse>(
      '/api/sessions/current/retry',
      { method: 'POST' },
    )
    generationStatus.value = generation.status
    schedulePoll()
  } catch {
    submissionError.value = true
  } finally {
    submitting.value = false
  }
}

onMounted(() =>
  document.addEventListener('visibilitychange', cancelCountdownOnHiddenTab),
)
onMounted(() => void resumeGeneration())
onBeforeUnmount(() => {
  isActive = false
  document.removeEventListener('visibilitychange', cancelCountdownOnHiddenTab)
  countdown.cancel()
  clearGenerationState()
  camera.reset()
})
</script>

<template>
  <main class="capture-page">
    <template v-if="selectedTheme">
      <section class="intro" aria-labelledby="capture-heading">
        <p class="eyebrow">
          {{ t(themeMessages[selectedTheme.id].name) }}
          <span aria-hidden="true">&middot;</span>
          {{ t(themeMessages[selectedTheme.id].label) }}
        </p>
        <h1 id="capture-heading">{{ t('capture.ready.title') }}</h1>
        <p>{{ t('capture.ready.description') }}</p>
      </section>

      <section class="capture-workspace" aria-live="polite">
        <div v-if="camera.state.value === 'previewing'" class="media-frame">
          <img
            :src="camera.previewUrl.value ?? undefined"
            :alt="t('capture.review.previewAlt')"
          />
        </div>
        <div
          v-else-if="
            camera.state.value === 'streaming' || countdown.isCountingDown.value
          "
          class="media-frame"
        >
          <video
            ref="videoElement"
            data-testid="capture-video"
            autoplay
            muted
            playsinline
            @loadedmetadata="markVideoReady"
          />
          <p
            v-if="countdown.isCountingDown.value"
            class="countdown"
            role="status"
          >
            {{ countdown.remainingSeconds.value }}
          </p>
        </div>
        <div v-else-if="recoveringGeneration" class="media-frame empty-media">
          <p>{{ t('capture.generating.pending') }}</p>
        </div>
        <div v-else class="media-frame empty-media">
          <Camera :size="48" aria-hidden="true" />
          <p>
            {{
              camera.state.value === 'compressing'
                ? t('capture.ready.processingImage')
                : t('capture.ready.mediaPlaceholder')
            }}
          </p>
          <button
            v-if="
              camera.state.value === 'idle' || camera.state.value === 'error'
            "
            data-testid="capture-activate-camera"
            type="button"
            @click="startCamera"
          >
            {{ t('capture.ready.activateCamera') }}
          </button>
        </div>

        <p v-if="camera.error.value" class="error" role="alert">
          {{ t(`capture.errors.${camera.error.value}`) }}
        </p>

        <div
          v-if="
            camera.state.value === 'requestingPermission' ||
            camera.state.value === 'compressing'
          "
          class="actions"
        >
          <p>
            {{
              camera.state.value === 'compressing'
                ? t('capture.ready.processingImage')
                : t('capture.ready.requestingPermission')
            }}
          </p>
        </div>
        <div v-else-if="camera.state.value === 'streaming'" class="actions">
          <button
            v-if="countdown.isCountingDown.value"
            type="button"
            @click="countdown.cancel"
          >
            {{ t('capture.countdown.cancel') }}
          </button>
          <template v-else>
            <button
              data-testid="capture-take-photo"
              type="button"
              :disabled="!videoReady"
              @click="startCountdown"
            >
              {{ t('capture.ready.takePhoto') }}
            </button>
            <button
              class="secondary-button icon-button"
              type="button"
              :aria-label="t('capture.ready.switchCamera')"
              @click="switchCamera"
            >
              <SwitchCamera :size="20" aria-hidden="true" />
            </button>
          </template>
        </div>
        <div
          v-else-if="camera.state.value === 'previewing' && !locallyApproved"
          class="actions review-actions"
        >
          <button
            class="secondary-button"
            data-testid="capture-retake"
            type="button"
            @click="retake"
          >
            <RotateCcw :size="20" aria-hidden="true" />
            {{ t('capture.review.retake') }}
          </button>
          <button
            data-testid="capture-use-picture"
            type="button"
            :disabled="submitting"
            @click="approvePicture"
          >
            {{ t('capture.review.usePicture') }}
          </button>
        </div>
        <p
          v-else-if="locallyApproved && !captureGenerationEnabled"
          class="approval"
          data-testid="capture-approved"
          role="status"
        >
          {{ t('capture.review.locallyApproved') }}
        </p>
        <div
          v-else-if="locallyApproved"
          class="approval"
          data-testid="capture-generating"
          role="status"
        >
          <p>{{ t(`capture.generating.${generationStatus ?? 'pending'}`) }}</p>
          <button
            v-if="generationStatus === 'failed'"
            data-testid="capture-retry-generation"
            type="button"
            :disabled="submitting"
            @click="retryGeneration"
          >
            {{ t('common.actions.retry') }}
          </button>
          <p v-if="submissionError" class="error" role="alert">
            {{ t('capture.errors.generationUnavailable') }}
          </p>
        </div>
        <p
          v-else-if="submissionError"
          class="error"
          data-testid="capture-generation-error"
          role="alert"
        >
          {{ t('capture.errors.generationUnavailable') }}
        </p>
      </section>
    </template>
    <template v-else>
      <h1 data-testid="capture-invalid-theme">
        {{ t('capture.invalidTheme') }}
      </h1>
    </template>
    <NuxtLink to="/">{{ t('common.actions.backToThemes') }}</NuxtLink>
  </main>
</template>

<style scoped>
.capture-page {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter) var(--space-7);
}
.intro {
  max-width: 820px;
  margin-bottom: var(--space-4);
}
.eyebrow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-1);
  color: var(--color-action-primary);
  font-weight: 700;
  text-transform: uppercase;
}
h1 {
  margin: 0 0 var(--space-1);
  font-size: 48px;
  line-height: 1.12;
}
.intro > p:last-child {
  margin: 0;
  color: var(--color-muted-text);
  font-size: 18px;
  line-height: 1.5;
}
.capture-workspace {
  max-width: 100%;
}
.media-frame {
  position: relative;
  display: grid;
  aspect-ratio: 5 / 2;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--color-divider);
  border-radius: var(--card-radius);
  background: var(--color-text);
}
video,
img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.empty-media {
  align-content: center;
  gap: var(--space-3);
  background: var(--color-surface);
  color: var(--color-muted-text);
}
.empty-media p {
  margin: 0;
}
.countdown {
  position: absolute;
  display: grid;
  width: 120px;
  aspect-ratio: 1;
  margin: 0;
  place-items: center;
  border-radius: 50%;
  background: rgb(255 255 255 / 75%);
  color: var(--color-action-primary);
  font-size: 72px;
  font-weight: 700;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-5);
}
button {
  display: inline-flex;
  min-height: var(--control-height);
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-5);
  border: 1px solid var(--color-action-primary);
  border-radius: 999px;
  background: var(--color-action-primary);
  color: var(--color-surface);
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  border-color: var(--color-divider);
  background: var(--color-divider);
  color: var(--color-muted-text);
  cursor: not-allowed;
}
.secondary-button {
  background: var(--color-surface);
  color: var(--color-text);
}
.icon-button {
  width: var(--control-height);
  padding: 0;
}
.error {
  margin: var(--space-4) 0 0;
  color: var(--color-action-primary);
  font-weight: 700;
}
.approval {
  margin: var(--space-5) 0 0;
  font-weight: 700;
}
a {
  display: inline-block;
  margin-top: var(--space-5);
  color: var(--color-text);
}
@media (max-width: 700px) {
  h1 {
    font-size: 36px;
  }
  .media-frame {
    aspect-ratio: 4 / 3;
  }
}
@media (max-width: 480px) {
  h1 {
    font-size: 28px;
  }
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
  .icon-button {
    width: 100%;
  }
}
</style>

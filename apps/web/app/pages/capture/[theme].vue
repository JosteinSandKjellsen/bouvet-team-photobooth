<script setup lang="ts">
import type {
  GenerationAcceptedResponse,
  GenerationStatusResponse,
  ThemesResponse,
} from '@bouvet-team-photobooth/contracts'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  SwitchCamera,
  X,
} from '@lucide/vue'
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
const generationProgressStage = computed(() => {
  if (!locallyApproved.value || !captureGenerationEnabled.value) {
    return null
  }

  switch (generationStatus.value) {
    case 'succeeded':
      return 'complete'
    case 'submitted':
      return 'building'
    case 'submitting':
    case 'submission_unknown':
      return 'checking'
    case 'failed':
      return 'failed'
    default:
      return 'preparing'
  }
})
const isGeneratingIntro = computed(
  () =>
    generationProgressStage.value !== null &&
    generationProgressStage.value !== 'failed' &&
    generationProgressStage.value !== 'complete',
)
const generationProgressLabelKey = computed(() => {
  switch (generationProgressStage.value) {
    case 'checking':
      return 'capture.generating.progress.checking'
    case 'building':
      return 'capture.generating.progress.building'
    case 'complete':
      return 'capture.generating.progress.teamReady'
    case 'failed':
    case 'preparing':
      return 'capture.generating.progress.preparing'
    default:
      return null
  }
})
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

async function initializeCapture() {
  await resumeGeneration()
  if (!isActive || locallyApproved.value) {
    return
  }

  await camera.activateIfPermissionGranted()
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
onMounted(() => void initializeCapture())
onBeforeUnmount(() => {
  isActive = false
  document.removeEventListener('visibilitychange', cancelCountdownOnHiddenTab)
  countdown.cancel()
  clearGenerationState()
  camera.reset()
})
</script>

<template>
  <main class="capture-page page-with-footer">
    <template v-if="selectedTheme">
      <section class="intro" aria-labelledby="capture-heading">
        <p class="eyebrow">
          {{ t(themeMessages[selectedTheme.id].name) }}
          <span aria-hidden="true">&middot;</span>
          {{ t(themeMessages[selectedTheme.id].label) }}
        </p>
        <h1 id="capture-heading">
          {{
            t(
              isGeneratingIntro
                ? 'capture.generating.title'
                : 'capture.ready.title',
            )
          }}
        </h1>
        <p>
          {{
            t(
              isGeneratingIntro
                ? 'capture.generating.subtitle'
                : 'capture.ready.description',
            )
          }}
        </p>
      </section>

      <section class="capture-workspace" aria-live="polite">
        <div v-if="camera.state.value === 'previewing'" class="media-frame">
          <img
            :src="camera.previewUrl.value ?? undefined"
            :alt="t('capture.review.previewAlt')"
          />
          <div
            v-if="locallyApproved && captureGenerationEnabled"
            class="processing-overlay"
            data-testid="capture-processing-overlay"
            aria-hidden="true"
          >
            <div class="processing-overlay__content">
              <div class="universe-loader">
                <span class="universe-loader__ring ring--outer" />
                <span class="universe-loader__ring ring--middle" />
                <span class="universe-loader__ring ring--inner" />
                <span class="universe-loader__dot" />
              </div>
              <p class="processing-overlay__title">
                {{ t('capture.generating.overlay.title') }}
              </p>
              <p class="processing-overlay__description">
                {{ t('capture.generating.overlay.description') }}
              </p>
            </div>
          </div>
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
          <ActionButton
            v-if="
              camera.state.value === 'idle' || camera.state.value === 'error'
            "
            data-testid="capture-activate-camera"
            @click="startCamera"
          >
            {{ t('capture.ready.activateCamera') }}
          </ActionButton>
        </div>

        <ol
          v-if="generationProgressStage"
          class="generation-progress"
          data-testid="capture-generation-progress"
          :data-stage="generationProgressStage"
          :aria-label="t('capture.generating.progress.label')"
        >
          <li class="generation-progress__step is-complete">
            <span class="generation-progress__indicator" aria-hidden="true">
              <Check :size="18" stroke-width="3" />
            </span>
          </li>
          <li
            class="generation-progress__step"
            :class="{
              'is-active': generationProgressStage === 'preparing',
              'is-complete': ['checking', 'building', 'complete'].includes(
                generationProgressStage,
              ),
              'is-failed': generationProgressStage === 'failed',
            }"
          >
            <span class="generation-progress__indicator" aria-hidden="true">
              <Check
                v-if="
                  ['checking', 'building', 'complete'].includes(
                    generationProgressStage,
                  )
                "
                :size="18"
                stroke-width="3"
              />
              <X
                v-else-if="generationProgressStage === 'failed'"
                :size="18"
                stroke-width="3"
              />
            </span>
            <span
              v-if="
                generationProgressStage === 'preparing' ||
                generationProgressStage === 'failed'
              "
              class="generation-progress__step-label"
            >
              {{ t('capture.generating.progress.preparing') }}
            </span>
          </li>
          <li
            class="generation-progress__step"
            :class="{
              'is-active': generationProgressStage === 'checking',
              'is-complete': ['building', 'complete'].includes(
                generationProgressStage,
              ),
            }"
          >
            <span class="generation-progress__indicator" aria-hidden="true">
              <Check
                v-if="
                  ['building', 'complete'].includes(generationProgressStage)
                "
                :size="18"
                stroke-width="3"
              />
            </span>
            <span
              v-if="generationProgressStage === 'checking'"
              class="generation-progress__step-label"
            >
              {{ t('capture.generating.progress.checking') }}
            </span>
          </li>
          <li
            class="generation-progress__step"
            :class="{
              'is-active': generationProgressStage === 'building',
              'is-complete': generationProgressStage === 'complete',
            }"
          >
            <span class="generation-progress__indicator" aria-hidden="true">
              <Check
                v-if="generationProgressStage === 'complete'"
                :size="18"
                stroke-width="3"
              />
            </span>
            <span
              v-if="generationProgressStage === 'building'"
              class="generation-progress__step-label"
            >
              {{ t('capture.generating.progress.building') }}
            </span>
          </li>
          <li
            class="generation-progress__step"
            :class="{
              'is-active': generationProgressStage === 'complete',
            }"
          >
            <span class="generation-progress__indicator" aria-hidden="true" />
            <span
              v-if="generationProgressStage === 'complete'"
              class="generation-progress__step-label"
            >
              {{ t('capture.generating.progress.teamReady') }}
            </span>
          </li>
        </ol>
        <p
          v-if="generationProgressLabelKey"
          class="generation-progress__mobile-label"
          data-testid="capture-generation-progress-label"
        >
          {{ t(generationProgressLabelKey) }}
        </p>

        <p v-if="camera.error.value" class="error" role="alert">
          {{ t(`capture.errors.${camera.error.value}`) }}
        </p>

        <div v-if="camera.state.value === 'compressing'" class="actions">
          <p>{{ t('capture.ready.processingImage') }}</p>
        </div>
        <div
          v-else-if="camera.state.value === 'streaming'"
          class="actions capture-actions"
        >
          <ActionButton
            v-if="countdown.isCountingDown.value"
            @click="countdown.cancel"
          >
            {{ t('capture.countdown.cancel') }}
          </ActionButton>
          <template v-else>
            <ActionButton
              data-testid="capture-take-photo"
              :disabled="!videoReady"
              @click="startCountdown"
            >
              {{ t('capture.ready.takePhoto') }}
            </ActionButton>
            <ActionButton
              v-if="camera.canSwitchCamera.value"
              type="button"
              :aria-label="t('capture.ready.switchCamera')"
              icon-only
              variant="secondary"
              @click="switchCamera"
            >
              <SwitchCamera :size="20" aria-hidden="true" />
            </ActionButton>
          </template>
        </div>
        <div
          v-else-if="camera.state.value === 'previewing' && !locallyApproved"
          class="actions review-actions"
        >
          <ActionButton
            data-testid="capture-retake"
            variant="secondary"
            @click="retake"
          >
            <Camera :size="20" aria-hidden="true" />
            {{ t('capture.review.retake') }}
          </ActionButton>
          <ActionButton
            data-testid="capture-use-picture"
            :disabled="submitting"
            @click="approvePicture"
          >
            {{ t('capture.review.usePicture') }}
            <ArrowRight :size="20" aria-hidden="true" />
          </ActionButton>
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
          <ActionButton
            v-if="generationStatus === 'failed'"
            data-testid="capture-retry-generation"
            :disabled="submitting"
            @click="retryGeneration"
          >
            {{ t('common.actions.retry') }}
          </ActionButton>
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
    <PageFooter v-if="!(locallyApproved && captureGenerationEnabled)">
      <ActionButton
        as="link"
        data-testid="capture-back-to-themes"
        to="/"
        variant="navigation"
      >
        <ArrowLeft :size="28" aria-hidden="true" />
        {{ t('common.actions.backToThemes') }}
      </ActionButton>
    </PageFooter>
  </main>
</template>

<style scoped>
.capture-page {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter);
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
  font-size: 17px;
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
.processing-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 72%);
}
.processing-overlay__content {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  text-align: center;
}
.universe-loader {
  position: relative;
  width: 132px;
  aspect-ratio: 1;
  margin-bottom: var(--space-1);
}
.universe-loader__ring {
  position: absolute;
  display: block;
  box-sizing: border-box;
  border: 3px solid transparent;
  border-radius: 50%;
  animation: orbit 2.8s linear infinite;
}
.universe-loader__ring::after {
  position: absolute;
  top: 50%;
  right: -8px;
  width: 18px;
  aspect-ratio: 1;
  border-radius: 50%;
  content: '';
  transform: translateY(-50%);
}
.ring--outer {
  --loader-rotation: -45deg;
  inset: 0;
  border-top-color: var(--color-brand-accent);
  border-right-color: var(--color-brand-accent);
}
.ring--outer::after {
  background: var(--color-brand-accent);
}
.ring--middle {
  --loader-rotation: 70deg;
  inset: 20px;
  border-right-color: var(--color-loader-blush);
  border-bottom-color: var(--color-loader-blush);
  animation-duration: 2.1s;
  animation-direction: reverse;
}
.ring--middle::after {
  background: var(--color-loader-blush);
}
.ring--inner {
  --loader-rotation: 20deg;
  inset: 40px;
  border-bottom-color: var(--color-loader-coral);
  border-left-color: var(--color-loader-coral);
  animation-duration: 1.6s;
}
.ring--inner::after {
  background: var(--color-loader-coral);
}
.universe-loader__dot {
  position: absolute;
  bottom: 10px;
  left: 50%;
  width: 16px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--color-loader-orange);
  transform: translateX(-50%);
}
.processing-overlay__title,
.processing-overlay__description {
  margin: 0;
}
.processing-overlay__title {
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
}
.processing-overlay__description {
  color: var(--color-muted-text);
  font-size: 16px;
}
@keyframes orbit {
  from {
    transform: rotate(var(--loader-rotation));
  }
  to {
    transform: rotate(calc(var(--loader-rotation) + 360deg));
  }
}
.generation-progress {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}
.generation-progress__step {
  position: relative;
  display: grid;
  min-width: 0;
  justify-items: center;
  gap: var(--space-2);
  color: var(--color-muted-text);
}
.generation-progress__step:not(:last-child)::after {
  position: absolute;
  top: 17px;
  left: calc(50% + 20px);
  width: calc(100% - 40px);
  height: 2px;
  background: var(--color-divider);
  content: '';
}
.generation-progress__step.is-complete:not(:last-child)::after {
  background: var(--color-action-primary);
}
.generation-progress__indicator {
  z-index: 1;
  display: grid;
  width: 36px;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid var(--color-muted-text);
  border-radius: 50%;
  background: transparent;
}
.generation-progress__step.is-complete,
.generation-progress__step.is-active {
  color: var(--color-text);
}
.generation-progress__step.is-complete .generation-progress__indicator {
  border-color: var(--color-action-primary);
  background: var(--color-action-primary);
  color: var(--color-surface);
}
.generation-progress__step.is-failed {
  color: var(--color-action-primary);
}
.generation-progress__step.is-failed .generation-progress__indicator {
  border-color: var(--color-action-primary);
  color: var(--color-action-primary);
}
.generation-progress__step.is-active .generation-progress__indicator {
  border: 3px solid var(--color-action-primary);
  animation: generation-progress-pulse 2.4s ease-in-out infinite;
}
.generation-progress__step.is-active
  .generation-progress__indicator:not(:has(svg))::after {
  display: block;
  width: 14px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--color-action-primary);
  content: '';
}
@keyframes generation-progress-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
.generation-progress__step-label,
.generation-progress__mobile-label {
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
}
.generation-progress__mobile-label {
  display: none;
  margin: var(--space-2) 0 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-5);
}
.review-actions,
.capture-actions {
  justify-content: center;
}
.review-actions :deep(.app-action),
.capture-actions :deep(.app-action:not(.app-action--icon)) {
  flex: 0 1 18rem;
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
  .review-actions :deep(.app-action),
  .capture-actions :deep(.app-action:not(.app-action--icon)) {
    flex-basis: auto;
  }
  .actions :deep(.app-action--icon) {
    width: 100%;
  }
  .generation-progress__step {
    font-size: 11px;
  }
  .generation-progress__step-label {
    display: none;
  }
  .generation-progress__mobile-label {
    display: block;
  }
  .universe-loader {
    width: 112px;
  }
  .processing-overlay__title {
    font-size: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .universe-loader__ring,
  .generation-progress__step.is-active .generation-progress__indicator {
    animation: none;
  }
}
</style>

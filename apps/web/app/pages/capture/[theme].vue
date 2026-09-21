<script setup lang="ts">
import type { ThemesResponse } from '@bouvet-team-photobooth/contracts'
import { Camera, RotateCcw, SwitchCamera } from '@lucide/vue'
import { themeMessages } from '~/utils/themeMessages'

defineOptions({ name: 'ThemeCapturePage' })

const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch<ThemesResponse>('/api/themes')
const selectedTheme = computed(() =>
  data.value?.themes.find((theme) => theme.id === route.params.theme),
)
const camera = useLocalCameraCapture()
const videoElement = ref<HTMLVideoElement | null>(null)
const videoReady = ref(false)
const locallyApproved = ref(false)
const countdown = useCaptureCountdown({
  onComplete: () => void captureImage(),
})

watch(videoElement, (video) => void camera.connectVideo(video))

function startCamera() {
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

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = Array.from(input.files ?? [])
  if (file) {
    locallyApproved.value = false
    void camera.selectFile(file)
  }
  input.value = ''
}

function retake() {
  locallyApproved.value = false
  camera.reset()
  startCamera()
}

function approvePicture() {
  locallyApproved.value = true
}

onMounted(() =>
  document.addEventListener('visibilitychange', cancelCountdownOnHiddenTab),
)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', cancelCountdownOnHiddenTab)
  countdown.cancel()
  camera.reset()
})
</script>

<template>
  <main class="capture-page">
    <template v-if="selectedTheme">
      <section class="intro" aria-labelledby="capture-heading">
        <p class="eyebrow">{{ t(themeMessages[selectedTheme.id].name) }}</p>
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
        <div v-else class="media-frame empty-media">
          <Camera :size="48" aria-hidden="true" />
          <p>
            {{
              camera.state.value === 'compressing'
                ? t('capture.ready.processingImage')
                : t('capture.ready.mediaPlaceholder')
            }}
          </p>
        </div>

        <p v-if="camera.error.value" class="error" role="alert">
          {{ t(`capture.errors.${camera.error.value}`) }}
        </p>

        <div
          v-if="camera.state.value === 'idle' || camera.state.value === 'error'"
          class="actions"
        >
          <button type="button" @click="startCamera">
            {{ t('capture.ready.activateCamera') }}
          </button>
          <label class="file-action">
            {{ t('capture.ready.chooseFile') }}
            <input
              accept="image/jpeg,image/png,image/webp"
              type="file"
              @change="selectFile"
            />
          </label>
        </div>
        <div
          v-else-if="
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
          <button class="secondary-button" type="button" @click="retake">
            <RotateCcw :size="20" aria-hidden="true" />
            {{ t('capture.review.retake') }}
          </button>
          <button type="button" @click="approvePicture">
            {{ t('capture.review.usePicture') }}
          </button>
        </div>
        <p v-else-if="locallyApproved" class="approval" role="status">
          {{ t('capture.review.locallyApproved') }}
        </p>
      </section>
    </template>
    <template v-else>
      <h1>{{ t('capture.invalidTheme') }}</h1>
    </template>
    <NuxtLink to="/">{{ t('common.actions.backToThemes') }}</NuxtLink>
  </main>
</template>

<style scoped>
.capture-page {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: var(--space-7) var(--page-gutter);
}
.intro {
  max-width: 720px;
  margin-bottom: var(--space-6);
}
.eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-action-primary);
  font-weight: 700;
}
h1 {
  margin: 0 0 var(--space-4);
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
  max-width: 820px;
}
.media-frame {
  position: relative;
  display: grid;
  min-height: min(56vw, 460px);
  place-items: center;
  overflow: hidden;
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
  background: rgb(23 23 23 / 75%);
  color: var(--color-surface);
  font-size: 72px;
  font-weight: 700;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-5);
}
button,
.file-action {
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
.secondary-button,
.file-action {
  background: var(--color-surface);
  color: var(--color-text);
}
.icon-button {
  width: var(--control-height);
  padding: 0;
}
.file-action input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
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
  .capture-page {
    padding-top: var(--space-6);
  }
  h1 {
    font-size: 36px;
  }
  .media-frame {
    min-height: min(70vw, 420px);
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

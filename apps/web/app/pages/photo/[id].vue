<script setup lang="ts">
import type { PublicPhotoResponse } from '@bouvet-team-photobooth/contracts'
import { Clipboard, Download, Printer } from '@lucide/vue'
import QRCode from 'qrcode'

defineOptions({ name: 'PhotoResultPage' })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { public: publicConfig } = useRuntimeConfig()
const photoId = computed(() => String(route.params.id))
const { data, refresh, status } = await useFetch<PublicPhotoResponse>(
  () => `/api/photos/${photoId.value}`,
  { watch: [photoId] },
)
const copyStatus = ref<'copied' | 'failed' | null>(null)
const printFailed = ref(false)
const publicUrl = ref('')
const qrCodeUrl = ref<string | null>(null)
let hasMounted = false
let kioskResetTimer: ReturnType<typeof setTimeout> | undefined

const kioskMode = computed(() => String(publicConfig.kioskMode) === 'true')
const kioskResetDelay = computed(() => {
  const value = Number(publicConfig.kioskResetMs)
  return Number.isSafeInteger(value) && value > 0 ? value : 60_000
})

function isLocalOrigin(url: URL) {
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
}

async function createShareAssets() {
  if (!import.meta.client) return

  copyStatus.value = null
  qrCodeUrl.value = null
  const configuredOrigin = String(publicConfig.photoOrigin ?? '')
  const origin =
    configuredOrigin ||
    (isLocalOrigin(new URL(window.location.origin))
      ? window.location.origin
      : '')
  if (!origin) {
    publicUrl.value = ''
    return
  }

  try {
    const url = new URL(`/photo/${photoId.value}`, origin)
    if (url.protocol !== 'https:' && !isLocalOrigin(url)) {
      publicUrl.value = ''
      return
    }

    publicUrl.value = url.toString()
    qrCodeUrl.value = await QRCode.toDataURL(publicUrl.value, {
      color: { dark: '#11133c', light: '#ffffff' },
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    })
  } catch {
    publicUrl.value = ''
  }
}

async function copyPublicUrl() {
  if (!publicUrl.value) return

  try {
    await navigator.clipboard.writeText(publicUrl.value)
    copyStatus.value = 'copied'
  } catch {
    copyStatus.value = 'failed'
  }
}

function printPhoto() {
  printFailed.value = false
  try {
    window.print()
  } catch {
    printFailed.value = true
  }
}

function retryPhoto() {
  void refresh()
}

function clearKioskResetTimer() {
  if (kioskResetTimer) {
    clearTimeout(kioskResetTimer)
    kioskResetTimer = undefined
  }
}

async function resetKiosk() {
  clearKioskResetTimer()
  try {
    await $fetch('/api/sessions/current/close', { method: 'POST' })
  } finally {
    await router.replace('/')
  }
}

function refreshKioskResetTimer() {
  if (!kioskMode.value) return

  clearKioskResetTimer()
  kioskResetTimer = setTimeout(() => void resetKiosk(), kioskResetDelay.value)
}

watch(photoId, () => {
  if (hasMounted) void createShareAssets()
})

onMounted(() => {
  hasMounted = true
  void createShareAssets()
  if (kioskMode.value) {
    document.addEventListener('keydown', refreshKioskResetTimer)
    document.addEventListener('pointerdown', refreshKioskResetTimer)
    refreshKioskResetTimer()
  }
})

onBeforeUnmount(() => {
  clearKioskResetTimer()
  document.removeEventListener('keydown', refreshKioskResetTimer)
  document.removeEventListener('pointerdown', refreshKioskResetTimer)
})
</script>

<template>
  <main class="photo-page">
    <section class="intro" aria-labelledby="photo-heading">
      <h1 id="photo-heading">{{ t('photo.title') }}</h1>
    </section>

    <p v-if="status === 'pending'" data-testid="photo-loading" role="status">
      {{ t('photo.loading') }}
    </p>

    <section v-else-if="data" class="photo-workspace">
      <div class="image-region">
        <img
          data-testid="photo-image"
          :src="data.imageUrl"
          :alt="t('photo.imageAlt')"
          :width="data.width"
          :height="data.height"
        />
      </div>

      <aside class="share-panel">
        <a
          class="action-button"
          data-testid="photo-download"
          :href="data.downloadUrl"
          download
        >
          <Download :size="20" aria-hidden="true" />
          {{ t('photo.download') }}
        </a>
        <button data-testid="photo-print" type="button" @click="printPhoto">
          <Printer :size="20" aria-hidden="true" />
          {{ t('photo.print') }}
        </button>
        <button
          v-if="kioskMode"
          data-testid="photo-kiosk-reset"
          type="button"
          @click="resetKiosk"
        >
          {{ t('photo.newPicture') }}
        </button>
        <p v-if="printFailed" class="error" role="alert">
          {{ t('photo.printFailed') }}
        </p>

        <template v-if="publicUrl">
          <a class="public-url" :href="publicUrl">{{ publicUrl }}</a>
          <button
            class="secondary-button"
            data-testid="photo-copy-link"
            type="button"
            @click="copyPublicUrl"
          >
            <Clipboard :size="20" aria-hidden="true" />
            {{ t('photo.copyLink') }}
          </button>
          <p v-if="copyStatus === 'copied'" role="status">
            {{ t('photo.copied') }}
          </p>
          <p v-else-if="copyStatus === 'failed'" class="error" role="alert">
            {{ t('photo.copyFailed') }}
          </p>
          <img
            v-if="qrCodeUrl"
            class="qr-code"
            data-testid="photo-qr-code"
            :src="qrCodeUrl"
            :alt="t('photo.qrAlt')"
          />
          <p v-else role="status">{{ t('photo.qrLoading') }}</p>
        </template>
        <p v-else class="share-unavailable">
          {{ t('photo.shareUnavailable') }}
        </p>
      </aside>
    </section>

    <section v-else class="unavailable" data-testid="photo-unavailable">
      <h2>{{ t('photo.unavailableTitle') }}</h2>
      <p>{{ t('photo.unavailableDescription') }}</p>
      <button type="button" @click="retryPhoto">
        {{ t('photo.retry') }}
      </button>
      <button v-if="kioskMode" type="button" @click="resetKiosk">
        {{ t('photo.newPicture') }}
      </button>
      <NuxtLink v-else to="/">{{ t('photo.newPicture') }}</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.photo-page {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter) var(--space-7);
}
.intro {
  margin-bottom: var(--space-5);
}
.intro h1,
.unavailable h2 {
  margin: 0;
  font-size: 48px;
  line-height: 1.1;
}
.photo-workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: var(--space-6);
  align-items: start;
}
.image-region {
  display: grid;
  min-height: 360px;
  place-items: center;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--card-radius);
}
.image-region img {
  display: block;
  max-width: 100%;
  max-height: min(70dvh, 720px);
  object-fit: contain;
}
.share-panel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--card-radius);
}
button,
.action-button {
  display: inline-flex;
  min-height: var(--control-height);
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  color: var(--color-surface);
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  background: var(--color-action-primary);
  border: 1px solid var(--color-action-primary);
  border-radius: 999px;
}
.secondary-button {
  color: var(--color-text);
  background: transparent;
}
.public-url {
  overflow-wrap: anywhere;
  color: var(--color-text);
}
.qr-code {
  width: min(256px, 100%);
  height: auto;
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
}
.error {
  margin: 0;
  color: var(--color-action-primary);
}
.share-unavailable,
.unavailable p {
  margin: 0;
  color: var(--color-muted-text);
}
.unavailable {
  display: grid;
  gap: var(--space-4);
  max-width: 620px;
}
.unavailable a {
  color: var(--color-text);
}
@media (max-width: 900px) {
  .intro h1,
  .unavailable h2 {
    font-size: 36px;
  }
  .photo-workspace {
    grid-template-columns: 1fr;
  }
  .image-region {
    min-height: 0;
  }
}
@media (max-width: 480px) {
  .intro h1,
  .unavailable h2 {
    font-size: 28px;
  }
  .share-panel {
    padding: var(--space-4);
  }
}
@media print {
  :global(.masthead),
  .intro,
  .share-panel {
    display: none;
  }
  .photo-page {
    width: 100%;
    padding: 0;
  }
  .image-region {
    min-height: 0;
    border: 0;
  }
  .image-region img {
    width: 100%;
    max-height: none;
  }
}
</style>

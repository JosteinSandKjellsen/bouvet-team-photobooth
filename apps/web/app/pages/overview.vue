<script setup lang="ts">
import type {
  AdminAvailabilityResponse,
  PublicPhotoOverviewResponse,
} from '@bouvet-team-photobooth/contracts'
import { ArrowLeft, ArrowRight, Home, Trash2 } from '@lucide/vue'
import type PhotoAdminControls from '../components/PhotoAdminControls.vue'

defineOptions({ name: 'PhotoOverviewPage' })

const route = useRoute()
const { t } = useI18n()
const admin = ref<InstanceType<typeof PhotoAdminControls>>()
const before = computed(() =>
  typeof route.query.before === 'string' ? route.query.before : undefined,
)
const after = computed(() =>
  typeof route.query.after === 'string' ? route.query.after : undefined,
)
const isFirstPage = computed(() => !before.value && !after.value)
const { data, refresh, status } = await useFetch<PublicPhotoOverviewResponse>(
  '/api/photos/recent',
  { query: { after, before }, watch: [after, before] },
)
const { data: adminAvailability } = await useFetch<AdminAvailabilityResponse>(
  '/api/admin/availability',
)
let refreshTimer: ReturnType<typeof setInterval> | undefined

async function refreshAfterDeletion() {
  await refresh()
  if (!data.value?.photos.length && !isFirstPage.value) {
    await navigateTo('/overview')
  }
}

function formatPhotoAge(publishedAt: string) {
  const ageInSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(publishedAt).getTime()) / 1000),
  )
  if (ageInSeconds < 60) return t('overview.photoAge.now')

  const ageInMinutes = Math.floor(ageInSeconds / 60)
  if (ageInMinutes < 60) {
    return t('overview.photoAge.minutes', { count: ageInMinutes })
  }

  const ageInHours = Math.floor(ageInMinutes / 60)
  if (ageInHours < 24) {
    return t('overview.photoAge.hours', { count: ageInHours })
  }

  return t('overview.photoAge.days', { count: Math.floor(ageInHours / 24) })
}

function clearRefreshTimer() {
  if (!refreshTimer) return
  clearInterval(refreshTimer)
  refreshTimer = undefined
}

function refreshFirstPage() {
  clearRefreshTimer()
  if (!isFirstPage.value) return
  refreshTimer = setInterval(() => void refresh(), 10_000)
}

watch(isFirstPage, refreshFirstPage)

onMounted(refreshFirstPage)
onBeforeUnmount(clearRefreshTimer)
</script>

<template>
  <main class="overview-page page-with-footer">
    <header class="overview-header">
      <p class="eyebrow">{{ t('overview.eyebrow') }}</p>
      <h1>{{ t('overview.title') }}</h1>
    </header>

    <p
      v-if="status === 'pending' && !data"
      data-testid="overview-loading"
      role="status"
    >
      {{ t('overview.loading') }}
    </p>

    <template v-else-if="data">
      <p v-if="data.photos.length === 0" data-testid="overview-empty">
        {{ t('overview.empty') }}
      </p>

      <section v-else class="overview-content">
        <div class="gallery-column">
          <section class="photo-grid" data-testid="overview-grid">
            <div
              v-for="photo in data.photos"
              :key="photo.publicId"
              class="photo-container"
            >
              <NuxtLink
                :to="`/photo/${photo.publicId}`"
                class="photo-entry"
                data-testid="overview-photo"
              >
                <span class="photo-link" data-testid="overview-photo-image">
                  <img
                    :src="photo.imageUrl"
                    :alt="t('overview.imageAlt')"
                    :width="photo.width"
                    :height="photo.height"
                  />
                </span>
                <span class="photo-caption">{{
                  formatPhotoAge(photo.publishedAt)
                }}</span>
              </NuxtLink>
              <ActionButton
                v-if="admin?.active"
                class="photo-delete"
                variant="secondary"
                icon-only
                data-testid="overview-delete-photo"
                :disabled="admin.busy"
                :aria-label="t('overview.admin.delete')"
                :title="t('overview.admin.delete')"
                @click="admin.confirmDeletion(photo)"
              >
                <Trash2 :size="20" aria-hidden="true" />
              </ActionButton>
            </div>
          </section>
        </div>

        <nav class="overview-navigation" :aria-label="t('overview.navigation')">
          <ActionButton
            v-if="data.newerCursor"
            as="link"
            data-testid="overview-newer"
            :to="`/overview?after=${data.newerCursor}`"
            variant="navigation"
          >
            <ArrowLeft :size="24" aria-hidden="true" />
            {{ t('overview.newer') }}
          </ActionButton>
          <ActionButton
            v-if="data.olderCursor"
            as="link"
            data-testid="overview-older"
            class="overview-navigation__older"
            :to="`/overview?before=${data.olderCursor}`"
            variant="navigation"
          >
            {{ t('overview.older') }}
            <ArrowRight :size="24" aria-hidden="true" />
          </ActionButton>
        </nav>

        <aside v-if="data" class="count-panel" data-testid="overview-count">
          <p class="count-label">{{ t('overview.countLabel') }}</p>
          <p class="count-value">{{ data.completedCount }}</p>
          <p class="count-description">{{ t('overview.countUnit') }}</p>
        </aside>
      </section>
    </template>

    <section v-else class="overview-error" data-testid="overview-error">
      <p>{{ t('overview.loadError') }}</p>
      <ActionButton @click="refresh">{{
        t('common.actions.retry')
      }}</ActionButton>
    </section>

    <PageFooter>
      <ActionButton as="link" to="/" variant="navigation">
        <Home :size="24" aria-hidden="true" />
        {{ t('common.actions.goHome') }}
      </ActionButton>
      <PhotoAdminControls
        v-if="adminAvailability?.enabled"
        ref="admin"
        @removed="refreshAfterDeletion"
      />
    </PageFooter>
  </main>
</template>

<style scoped>
.overview-page {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter);
}
.overview-header {
  margin-bottom: var(--space-4);
}
.eyebrow {
  grid-column: 1 / -1;
  margin: 0 0 var(--space-2);
  color: var(--color-action-primary);
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
}
.overview-header h1 {
  margin: 0;
  font-size: 52px;
  line-height: 1.08;
}
.overview-content {
  display: grid;
  grid-template-areas:
    'gallery count'
    'navigation .';
  grid-template-columns: minmax(0, 3fr) minmax(230px, 0.95fr);
  gap: var(--space-5) var(--space-4);
  align-items: stretch;
}
.gallery-column {
  grid-area: gallery;
  min-width: 0;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4) var(--space-3);
}
.photo-entry {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.photo-container {
  position: relative;
  min-width: 0;
}
.photo-delete {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  background: var(--color-surface);
}
.photo-link {
  display: block;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--space-3);
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
}
.photo-link:hover {
  box-shadow: 0 0 14px rgb(17 19 60 / 16%);
  transform: translateY(-2px);
}
.photo-link:focus-visible {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 4px;
}
.photo-entry:focus-visible .photo-link {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 4px;
}
.photo-link img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-caption {
  height: var(--space-4);
  color: var(--color-muted-text);
  font-size: 12px;
  font-weight: 700;
  line-height: var(--space-4);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.count-panel {
  grid-area: count;
  display: flex;
  align-self: stretch;
  margin-bottom: calc(var(--space-2) + var(--space-4));
  flex-direction: column;
  justify-content: center;
  padding: var(--space-6);
  background: var(--color-surface);
  border-radius: var(--card-radius);
}
.count-label {
  margin: 0 0 var(--space-3);
  color: var(--color-action-primary);
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
}
.count-value {
  margin: 0;
  color: #111111;
  font-size: 104px;
  font-weight: 800;
  line-height: 0.95;
}
.count-description {
  margin: var(--space-2) 0 0;
  color: var(--color-muted-text);
  font-size: 17px;
}
@media (prefers-reduced-motion: reduce) {
  .photo-link {
    transition: none;
  }
  .photo-link:hover {
    transform: none;
  }
}
.overview-navigation {
  grid-area: navigation;
  display: flex;
  justify-content: space-between;
  min-height: var(--control-height);
}
.overview-navigation__older {
  margin-left: auto;
}
.overview-error {
  display: grid;
  gap: var(--space-3);
  max-width: 480px;
}
.overview-error p {
  margin: 0;
  color: var(--color-muted-text);
}
@media (max-width: 700px) {
  .overview-header h1 {
    font-size: 36px;
  }
  .overview-content {
    grid-template-areas:
      'gallery'
      'navigation'
      'count';
    grid-template-columns: 1fr;
  }
  .count-panel {
    min-height: 220px;
    margin-bottom: 0;
    padding: var(--space-5);
  }
  .count-value {
    font-size: 72px;
  }
  .photo-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .overview-header h1 {
    font-size: 28px;
  }
  .photo-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import type { PublicPhotoOverviewResponse } from '@bouvet-team-photobooth/contracts'
import { ArrowLeft, ArrowRight, Home } from '@lucide/vue'

defineOptions({ name: 'PhotoOverviewPage' })

const route = useRoute()
const { t } = useI18n()
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
let refreshTimer: ReturnType<typeof setInterval> | undefined

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
      <h1>{{ t('overview.title') }}</h1>
      <p v-if="data" class="completed-count" data-testid="overview-count">
        {{ t('overview.completedCount', data.completedCount) }}
      </p>
    </header>

    <p v-if="status === 'pending'" data-testid="overview-loading" role="status">
      {{ t('overview.loading') }}
    </p>

    <template v-else-if="data">
      <p v-if="data.photos.length === 0" data-testid="overview-empty">
        {{ t('overview.empty') }}
      </p>

      <section v-else class="photo-grid" data-testid="overview-grid">
        <NuxtLink
          v-for="photo in data.photos"
          :key="photo.publicId"
          :to="`/photo/${photo.publicId}`"
          class="photo-link"
          data-testid="overview-photo"
        >
          <img
            :src="photo.imageUrl"
            :alt="t('overview.imageAlt')"
            :width="photo.width"
            :height="photo.height"
          />
        </NuxtLink>
      </section>

      <nav class="overview-navigation" :aria-label="t('overview.navigation')">
        <ActionButton
          v-if="data.newerCursor"
          as="link"
          :to="`/overview?after=${data.newerCursor}`"
          variant="navigation"
        >
          <ArrowLeft :size="24" aria-hidden="true" />
          {{ t('overview.newer') }}
        </ActionButton>
        <ActionButton
          v-if="data.olderCursor"
          as="link"
          :to="`/overview?before=${data.olderCursor}`"
          variant="navigation"
        >
          {{ t('overview.older') }}
          <ArrowRight :size="24" aria-hidden="true" />
        </ActionButton>
      </nav>
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
    </PageFooter>
  </main>
</template>

<style scoped>
.overview-page {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter)
    calc(var(--space-7) + var(--control-height) + var(--space-6));
}
.overview-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}
.overview-header h1 {
  margin: 0;
  font-size: 48px;
  line-height: 1.1;
}
.completed-count {
  margin: 0;
  color: var(--color-muted-text);
  font-size: 18px;
  text-align: right;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
.photo-link {
  display: block;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--space-3);
}
.photo-link:focus-visible {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 4px;
}
.photo-link img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.overview-navigation {
  display: flex;
  justify-content: space-between;
  min-height: var(--control-height);
  margin-top: var(--space-5);
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
  .overview-page {
    padding-bottom: var(--space-7);
  }
  .overview-header {
    display: grid;
    gap: var(--space-2);
  }
  .overview-header h1 {
    font-size: 36px;
  }
  .completed-count {
    text-align: left;
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

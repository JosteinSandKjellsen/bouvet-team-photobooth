<script setup lang="ts">
import type {
  ThemeDescriptor,
  ThemesResponse,
} from '@bouvet-team-photobooth/contracts'

defineOptions({ name: 'ThemeSelectionPage' })

const { t } = useI18n()
const { data, error, status, refresh } = useFetch<ThemesResponse>(
  '/api/themes',
  {
    retry: 0,
  },
)

const themes = computed(() => data.value?.themes ?? [])
const loading = computed(
  () => status.value === 'idle' || status.value === 'pending',
)

const selectTheme = async (themeId: ThemeDescriptor['id']) => {
  await navigateTo(`/capture/${themeId}`)
}
</script>

<template>
  <main class="page-shell">
    <section class="intro" aria-labelledby="theme-heading">
      <p class="eyebrow">Bouvet Team Photobooth</p>
      <h1 id="theme-heading">{{ t('themeSelection.title') }}</h1>
      <p>{{ t('themeSelection.description') }}</p>
    </section>

    <p v-if="loading" role="status">{{ t('common.status.loading') }}</p>
    <section v-else-if="error" class="message" aria-live="polite">
      <p>{{ t('themeSelection.loadError') }}</p>
      <button type="button" @click="refresh()">
        {{ t('common.actions.retry') }}
      </button>
    </section>
    <p v-else-if="themes.length === 0" class="message">
      {{ t('themeSelection.empty') }}
    </p>
    <section v-else aria-labelledby="theme-heading">
      <ThemeGrid :themes="themes" @select="selectTheme" />
      <div class="actions">
        <NuxtLink to="/overview">{{
          t('themeSelection.overviewLink')
        }}</NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page-shell {
  width: min(1180px, 100%);
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
  margin: 0;
  font-size: 48px;
  line-height: 1.12;
}
.intro > p:last-child {
  margin: var(--space-4) 0 0;
  color: var(--color-muted-text);
  font-size: 18px;
  line-height: 1.5;
}
.message {
  padding: var(--space-5) 0;
  border-top: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
}
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-divider);
}
a {
  color: var(--color-text);
}
@media (max-width: 700px) {
  .page-shell {
    padding-top: var(--space-6);
  }
  h1 {
    font-size: 36px;
  }
}
@media (max-width: 480px) {
  h1 {
    font-size: 28px;
  }
  .actions a {
    text-align: center;
  }
}
</style>

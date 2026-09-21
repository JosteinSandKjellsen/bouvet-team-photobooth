<script setup lang="ts">
import type {
  ThemeDescriptor,
  ThemesResponse,
} from '@bouvet-team-photobooth/contracts'

defineOptions({ name: 'ThemeSelectionPage' })

const { t } = useI18n()
const selectedTheme = ref<ThemeDescriptor['id'] | null>(null)
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

const continueToCapture = async () => {
  if (!selectedTheme.value) {
    return
  }
  await navigateTo(`/capture/${selectedTheme.value}`)
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
    <form v-else @submit.prevent="continueToCapture">
      <ThemeGrid v-model="selectedTheme" :themes="themes" />
      <div class="actions">
        <button type="submit" :disabled="!selectedTheme">
          {{ t('common.actions.continue') }}
        </button>
        <NuxtLink to="/overview">{{
          t('themeSelection.overviewLink')
        }}</NuxtLink>
      </div>
    </form>
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
button {
  min-height: var(--control-height);
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
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
  .actions a {
    text-align: center;
  }
}
</style>

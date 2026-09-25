<script setup lang="ts">
import type {
  ThemeDescriptor,
  ThemesResponse,
} from '@bouvet-team-photobooth/contracts'
import { ContactRound, ShieldCheck } from '@lucide/vue'

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
const selectingTheme = ref(false)
const selectionError = ref(false)
const privacyDialog = ref<{ open: () => void } | null>(null)

const openPrivacyDialog = () => {
  privacyDialog.value?.open()
}

const selectTheme = async (themeId: ThemeDescriptor['id']) => {
  if (selectingTheme.value) {
    return
  }

  selectingTheme.value = true
  selectionError.value = false
  try {
    await $fetch('/api/sessions/current/close', { method: 'POST' })
    await navigateTo(`/capture/${themeId}`)
  } catch {
    selectionError.value = true
  } finally {
    selectingTheme.value = false
  }
}
</script>

<template>
  <main class="page-shell page-with-footer">
    <section class="intro" aria-labelledby="theme-heading">
      <p class="eyebrow">{{ t('privacy.eyebrow') }}</p>
      <h1 id="theme-heading">{{ t('themeSelection.title') }}</h1>
      <p>{{ t('themeSelection.description') }}</p>
    </section>

    <p v-if="loading" role="status">{{ t('common.status.loading') }}</p>
    <section v-else-if="error" class="message" aria-live="polite">
      <p>{{ t('themeSelection.loadError') }}</p>
      <ActionButton @click="refresh()">
        {{ t('common.actions.retry') }}
      </ActionButton>
    </section>
    <p v-else-if="themes.length === 0" class="message">
      {{ t('themeSelection.empty') }}
    </p>
    <section v-else class="theme-selection" aria-labelledby="theme-heading">
      <p v-if="selectionError" class="message" role="alert">
        {{ t('themeSelection.sessionResetError') }}
      </p>
      <ThemeGrid
        :disabled="selectingTheme"
        :themes="themes"
        @select="selectTheme"
      />
      <PageFooter>
        <ActionButton as="link" to="/overview" variant="navigation">
          <ContactRound :size="28" aria-hidden="true" />
          {{ t('themeSelection.overviewLink') }}
        </ActionButton>
        <ActionButton
          class="privacy-link"
          variant="navigation"
          data-testid="privacy-open"
          @click="openPrivacyDialog"
        >
          <ShieldCheck :size="24" aria-hidden="true" />
          {{ t('privacy.open') }}
        </ActionButton>
      </PageFooter>
    </section>
    <PrivacyDialog ref="privacyDialog" />
  </main>
</template>

<style scoped>
.page-shell {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 0 var(--page-gutter);
}
.theme-selection {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.intro {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
  column-gap: var(--space-7);
  margin-bottom: var(--space-6);
}
.eyebrow {
  grid-column: 1 / -1;
  margin: 0 0 var(--space-2);
  color: var(--color-action-primary);
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-size: 52px;
  line-height: 1.12;
}
.intro > p:last-child {
  align-self: center;
  margin: 0;
  color: var(--color-muted-text);
  font-size: 17px;
  line-height: 1.5;
}
.message {
  padding: var(--space-5) 0;
  border-top: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
}
.privacy-link {
  margin-left: auto;
}
@media (max-width: 700px) {
  .intro {
    grid-template-columns: 1fr;
    row-gap: var(--space-4);
  }
  h1 {
    font-size: 36px;
  }
}
@media (max-width: 480px) {
  h1 {
    font-size: 28px;
  }
}
</style>

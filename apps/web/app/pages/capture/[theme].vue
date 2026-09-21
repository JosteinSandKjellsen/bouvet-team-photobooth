<script setup lang="ts">
import type { ThemesResponse } from '@bouvet-team-photobooth/contracts'
import { themeMessages } from '~/utils/themeMessages'

defineOptions({ name: 'ThemeCapturePage' })

const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch<ThemesResponse>('/api/themes')
const selectedTheme = computed(() =>
  data.value?.themes.find((theme) => theme.id === route.params.theme),
)
</script>

<template>
  <main class="placeholder-page">
    <template v-if="selectedTheme">
      <p class="eyebrow">
        {{
          t('capture.title', { theme: t(themeMessages[selectedTheme.id].name) })
        }}
      </p>
      <h1>{{ t('capture.notReady') }}</h1>
      <p>{{ t('capture.notReadyDescription') }}</p>
    </template>
    <template v-else>
      <h1>{{ t('capture.invalidTheme') }}</h1>
    </template>
    <NuxtLink to="/">{{ t('common.actions.backToThemes') }}</NuxtLink>
  </main>
</template>

<style scoped>
.placeholder-page {
  width: min(840px, 100%);
  margin: 0 auto;
  padding: var(--space-7) var(--page-gutter);
}
.eyebrow {
  color: var(--color-action-primary);
  font-weight: 700;
}
h1 {
  margin: 0 0 var(--space-4);
  font-size: 40px;
}
p {
  font-size: 18px;
  line-height: 1.5;
}
a {
  display: inline-block;
  margin-top: var(--space-5);
  color: var(--color-text);
}
</style>

<script setup lang="ts">
defineOptions({ name: 'PhotoOverviewPage' })

const { t } = useI18n()
</script>

<template>
  <main class="placeholder-page">
    <h1>{{ t('overview.notReady') }}</h1>
    <p>{{ t('overview.notReadyDescription') }}</p>
    <NuxtLink to="/">{{ t('common.actions.goHome') }}</NuxtLink>
  </main>
</template>

<style scoped>
.placeholder-page {
  width: min(840px, 100%);
  margin: 0 auto;
  padding: var(--space-7) var(--page-gutter);
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

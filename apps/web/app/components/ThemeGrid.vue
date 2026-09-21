<script setup lang="ts">
import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import { themeMessages } from '~/utils/themeMessages'

defineProps<{
  themes: ThemeDescriptor[]
}>()

const emit = defineEmits<{
  select: [themeId: ThemeDescriptor['id']]
}>()

const { t } = useI18n()

const messageFor = (theme: ThemeDescriptor) => themeMessages[theme.id]
</script>

<template>
  <div class="theme-grid">
    <button
      v-for="theme in themes"
      :key="theme.id"
      type="button"
      class="theme-card"
      @click="emit('select', theme.id)"
    >
      <img :src="theme.image" alt="" />
      <span class="theme-copy">
        <span class="theme-name">{{ t(messageFor(theme).name) }}</span>
        <span class="theme-description">{{
          t(messageFor(theme).description)
        }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  border: 0;
}
.theme-card {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  min-height: 300px;
  border: 2px solid var(--color-divider);
  border-radius: var(--card-radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.theme-card:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.theme-card:hover {
  border-color: var(--color-action-primary);
}
img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: var(--color-divider);
}
.theme-copy {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-4);
}
.theme-name {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}
.theme-description {
  color: var(--color-muted-text);
  font-size: 16px;
  line-height: 1.4;
}
@media (max-width: 800px) {
  .theme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .theme-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .theme-card {
    min-height: 0;
  }
}
</style>

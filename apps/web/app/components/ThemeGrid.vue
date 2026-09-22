<script setup lang="ts">
import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import { themeMessages } from '~/utils/themeMessages'

defineProps<{
  disabled?: boolean
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
      :data-testid="`theme-${theme.id}`"
      :disabled="disabled"
      type="button"
      class="theme-card"
      @click="emit('select', theme.id)"
    >
      <img :src="theme.image" alt="" />
      <span class="theme-copy">
        <span class="theme-name">{{ t(messageFor(theme).name) }}</span>
        <span class="theme-label">{{ t(messageFor(theme).label) }}</span>
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
  gap: var(--space-3) var(--space-5);
  margin: 0;
  padding: 0;
  border: 0;
}
.theme-card {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  border: 0;
  border-radius: var(--card-radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
}
.theme-card:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.theme-card:hover {
  box-shadow: 0 0 14px rgb(17 19 60 / 16%);
  transform: translateY(-2px);
}
img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 1;
  border-radius: var(--card-radius) var(--card-radius) 0 0;
  object-fit: cover;
  background: var(--color-divider);
}
.theme-copy {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) var(--space-3);
}
.theme-name {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
}
.theme-label {
  color: var(--color-action-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}
.theme-description {
  color: var(--color-muted-text);
  font-size: 12px;
  line-height: 1.4;
}
@media (prefers-reduced-motion: reduce) {
  .theme-card {
    transition: none;
  }
  .theme-card:hover {
    transform: none;
  }
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

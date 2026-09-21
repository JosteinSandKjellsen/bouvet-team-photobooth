<script setup lang="ts">
import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import { Check } from '@lucide/vue'
import { themeMessages } from '~/utils/themeMessages'

const selectedTheme = defineModel<ThemeDescriptor['id'] | null>({
  required: true,
})

defineProps<{
  themes: ThemeDescriptor[]
}>()

const { t } = useI18n()

const messageFor = (theme: ThemeDescriptor) => themeMessages[theme.id]
</script>

<template>
  <fieldset class="theme-grid">
    <legend class="sr-only">{{ t('themeSelection.selectionLabel') }}</legend>
    <label
      v-for="theme in themes"
      :key="theme.id"
      class="theme-card"
      :class="{ selected: selectedTheme === theme.id }"
    >
      <input
        v-model="selectedTheme"
        type="radio"
        name="theme"
        :value="theme.id"
      />
      <img :src="theme.image" alt="" />
      <span class="theme-copy">
        <span class="theme-name">{{ t(messageFor(theme).name) }}</span>
        <span class="theme-description">{{
          t(messageFor(theme).description)
        }}</span>
      </span>
      <span class="selection-mark" aria-hidden="true">
        <Check v-if="selectedTheme === theme.id" :size="18" />
      </span>
    </label>
  </fieldset>
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
  cursor: pointer;
}
.theme-card:has(input:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.theme-card.selected {
  border-color: var(--color-action-primary);
}
input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
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
.selection-mark {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-action-primary);
  color: var(--color-surface);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
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

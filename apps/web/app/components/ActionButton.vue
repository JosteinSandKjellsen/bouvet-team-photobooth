<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: 'a' | 'button'
    disabled?: boolean
    download?: boolean | string
    href?: string
    iconOnly?: boolean
    type?: 'button' | 'reset' | 'submit'
    variant?: 'primary' | 'secondary'
  }>(),
  {
    as: 'button',
    disabled: false,
    download: false,
    href: undefined,
    iconOnly: false,
    type: 'button',
    variant: 'primary',
  },
)
</script>

<template>
  <button
    v-if="as === 'button'"
    class="app-action"
    :class="[`app-action--${variant}`, { 'app-action--icon': iconOnly }]"
    :disabled="disabled"
    :type="type"
  >
    <slot />
  </button>
  <a
    v-else
    class="app-action"
    :class="[`app-action--${variant}`, { 'app-action--icon': iconOnly }]"
    :download="download || undefined"
    :href="href"
  >
    <slot />
  </a>
</template>

<style scoped>
.app-action {
  display: inline-flex;
  min-height: var(--control-height);
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-action-primary);
  border-radius: 999px;
  background: var(--color-action-primary);
  color: var(--color-surface);
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.app-action--secondary {
  border-color: currentcolor;
  background: transparent;
  color: var(--color-text);
}
.app-action--icon {
  width: var(--control-height);
  padding: 0;
}
.app-action:disabled {
  border-color: var(--color-divider);
  background: var(--color-divider);
  color: var(--color-muted-text);
  cursor: not-allowed;
}
.app-action:focus-visible {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 4px;
}
</style>

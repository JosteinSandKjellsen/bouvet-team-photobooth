<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: 'a' | 'button' | 'link'
    disabled?: boolean
    download?: boolean | string
    href?: string
    iconOnly?: boolean
    to?: string
    type?: 'button' | 'reset' | 'submit'
    variant?: 'navigation' | 'primary' | 'secondary'
  }>(),
  {
    as: 'button',
    disabled: false,
    download: false,
    href: undefined,
    iconOnly: false,
    to: undefined,
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
    v-else-if="as === 'a'"
    class="app-action"
    :class="[`app-action--${variant}`, { 'app-action--icon': iconOnly }]"
    :download="download || undefined"
    :href="href"
  >
    <slot />
  </a>
  <NuxtLink
    v-else
    class="app-action"
    :class="[`app-action--${variant}`, { 'app-action--icon': iconOnly }]"
    :to="to"
  >
    <slot />
  </NuxtLink>
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
.app-action--navigation {
  padding: 0 var(--space-3);
  border-color: transparent;
  background: transparent;
  color: var(--color-muted-text);
}
.app-action--navigation:hover {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
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

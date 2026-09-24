<template>
  <footer class="page-footer">
    <div class="page-footer__content">
      <slot />
    </div>
  </footer>
</template>

<style scoped>
.page-footer {
  z-index: 2;
  margin: auto calc(var(--page-gutter) * -1) 0;
  padding-top: var(--space-6);
  background: var(--color-canvas);
}
.page-footer__content {
  display: flex;
  min-height: var(--control-height);
  align-items: center;
  padding: var(--space-3) var(--page-gutter);
  border-top: 1px solid var(--color-divider);
}
</style>

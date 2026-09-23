<template>
  <footer class="page-footer">
    <div class="page-footer__content">
      <slot />
    </div>
  </footer>
</template>

<style scoped>
.page-footer {
  position: fixed;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  min-height: calc(var(--control-height) + var(--space-6));
  border-top: 1px solid var(--color-divider);
  background: var(--color-canvas);
}
.page-footer__content {
  display: flex;
  width: min(1280px, 100%);
  min-height: inherit;
  align-items: center;
  margin: 0 auto;
  padding: var(--space-3) var(--page-gutter);
}
@media (max-width: 700px) {
  .page-footer {
    position: static;
    min-height: 0;
    margin: var(--space-6) calc(var(--page-gutter) * -1) 0;
  }
  .page-footer__content {
    min-height: var(--control-height);
  }
}
</style>

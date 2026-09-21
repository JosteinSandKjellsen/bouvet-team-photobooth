<template>
  <div class="application">
    <header class="masthead">
      <NuxtLink class="brand" to="/" aria-label="Bouvet Team Photobooth">
        <img class="brand-logo" src="/bouvet-logo.svg" alt="" />
      </NuxtLink>
      <span class="app-name">Team Photobooth</span>
    </header>
    <NuxtPage />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
input {
  font: inherit;
}
.application {
  min-height: 100dvh;
  border-top: 5px solid var(--color-brand-accent);
}
.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-5) max(var(--page-gutter), calc((100% - 1180px) / 2));
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
}
.brand {
  display: flex;
  align-items: center;
  line-height: 0;
}
.brand-logo {
  width: 167px;
  height: 41px;
}
.app-name {
  font-size: 15px;
  color: var(--color-muted-text);
}
button:focus-visible {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 4px;
}
@media (max-width: 480px) {
  .masthead {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

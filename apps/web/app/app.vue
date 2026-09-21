<template>
  <div class="application">
    <img
      class="corner-decoration"
      src="/bouvet-geometry-top-right.svg"
      alt=""
      aria-hidden="true"
    />
    <div class="application-content">
      <header class="masthead">
        <NuxtLink class="brand" to="/" aria-label="Bouvet Team Photobooth">
          <img class="brand-logo" src="/bouvet-logo.svg" alt="" />
        </NuxtLink>
        <span class="app-name">Team Photobooth</span>
      </header>
      <NuxtPage />
    </div>
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
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  overflow: clip;
}
.corner-decoration {
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  width: min(1280px, 100%);
  height: auto;
  pointer-events: none;
}
.application-content {
  position: relative;
  z-index: 1;
}
.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-6) max(var(--page-gutter), calc((100% - 1180px) / 2))
    var(--space-4);
}
.brand {
  display: flex;
  align-items: center;
  line-height: 0;
}
.brand-logo {
  width: 112px;
  height: auto;
}
.app-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-muted-text);
  text-transform: uppercase;
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

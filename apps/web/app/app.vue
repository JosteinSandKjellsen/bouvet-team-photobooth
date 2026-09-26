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
        <a class="brand" href="/" aria-label="Bouvet Team Photobooth">
          <img class="brand-logo" src="/bouvet-logo.svg" alt="" />
        </a>
        <span class="app-name">
          HELLO STAVANGER • TEAM PHOTOBOOTH
          <span class="app-name__indicator" aria-hidden="true" />
        </span>
      </header>
      <div class="page-content">
        <NuxtPage />
      </div>
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
button {
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
}
.application {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
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
  display: flex;
  flex: 1;
  flex-direction: column;
}
.page-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding-top: clamp(var(--space-5), 4dvh, var(--space-7));
}
.page-with-footer {
  display: flex;
  flex: 1;
  flex-direction: column;
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
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-muted-text);
  text-transform: uppercase;
  white-space: nowrap;
}
.app-name__indicator {
  display: grid;
  width: 28px;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 50%;
  background: color-mix(
    in srgb,
    var(--color-brand-accent) 14%,
    var(--color-surface)
  );
}
.app-name__indicator::after {
  width: 10px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--color-brand-accent);
  content: '';
  animation: status-pulse 2.4s ease-in-out infinite;
}
@keyframes status-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
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
@media (prefers-reduced-motion: reduce) {
  .app-name__indicator::after {
    animation: none;
  }
}
</style>

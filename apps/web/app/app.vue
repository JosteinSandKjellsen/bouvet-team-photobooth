<script setup lang="ts">
import { Camera } from '@lucide/vue'
</script>

<template>
  <div class="application">
    <header class="masthead">
      <div class="brand">
        <Camera :size="24" aria-hidden="true" /><span>Bouvet</span>
      </div>
      <span class="app-name">Team Photobooth</span>
    </header>
    <main>
      <h1>Service status</h1>
      <HealthStatus />
    </main>
  </div>
</template>

<style>
:root {
  color-scheme: light;
  font-family: 'Avenir Next', 'Trebuchet MS', sans-serif;
  color: #222b29;
  background: #f6f8f7;
  font-synthesis: none;
  letter-spacing: 0;
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button {
  font: inherit;
}
.application {
  min-height: 100dvh;
  border-top: 5px solid #e35249;
}
.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 24px max(24px, calc((100% - 880px) / 2));
  border-bottom: 1px solid #dce3df;
  background: #fff;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 700;
}
.brand svg {
  color: #c73c35;
}
.app-name {
  font-size: 15px;
  color: #52605a;
}
main {
  max-width: 880px;
  margin: 0 auto;
  padding: 56px 24px;
}
h1 {
  margin: 0 0 24px;
  font-size: 28px;
  line-height: 1.3;
}
button:focus-visible {
  outline: 3px solid #b72f29;
  outline-offset: 4px;
}
@media (max-width: 480px) {
  main {
    padding-top: 32px;
  }
  .masthead {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

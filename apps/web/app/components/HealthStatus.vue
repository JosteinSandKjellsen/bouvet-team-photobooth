<script setup lang="ts">
import type { HealthResponse } from '@bouvet-team-photobooth/contracts'
import { CircleAlert, CircleCheck, RefreshCw } from '@lucide/vue'

const { data, status, error, refresh } = useFetch<HealthResponse>(
  '/api/health',
  {
    server: false,
    retry: 0,
  },
)

const checking = computed(
  () => status.value === 'idle' || status.value === 'pending',
)
const connected = computed(
  () =>
    !error.value && status.value === 'success' && data.value?.status === 'ok',
)
const label = computed(() =>
  checking.value
    ? 'Checking service'
    : connected.value
      ? 'Connected'
      : 'Service unavailable',
)
</script>

<template>
  <section class="health" aria-label="Application health">
    <div class="service">
      <h2>Application API</h2>
      <code>GET /api/health</code>
    </div>
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      :class="['status', { connected, checking }]"
    >
      <RefreshCw v-if="checking" :size="20" aria-hidden="true" />
      <CircleCheck v-else-if="connected" :size="20" aria-hidden="true" />
      <CircleAlert v-else :size="20" aria-hidden="true" />
      <span>{{ label }}</span>
    </p>
    <button type="button" :disabled="checking" @click="refresh()">
      <RefreshCw :size="16" aria-hidden="true" />
      {{
        checking
          ? 'Checking...'
          : connected
            ? 'Check again'
            : 'Retry connection'
      }}
    </button>
  </section>
</template>

<style scoped>
.health {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, auto) 180px;
  align-items: center;
  gap: 24px;
  padding: 24px 0;
  border-top: 1px solid #cdd8d1;
  border-bottom: 1px solid #cdd8d1;
}
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
code {
  color: #52605a;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #a62b28;
  font-size: 15px;
}
.status svg {
  flex-shrink: 0;
}
.connected {
  color: #14643e;
}
.checking {
  color: #52605a;
}
button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  width: 180px;
  padding: 10px 12px;
  border: 1px solid #a7b8ad;
  border-radius: 4px;
  background: #fff;
  color: #222b29;
  font-size: 14px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: #e7efe9;
}
button:disabled {
  cursor: wait;
  color: #65736a;
}
@media (max-width: 700px) {
  .health {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
}
</style>

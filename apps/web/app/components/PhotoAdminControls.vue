<script setup lang="ts">
import type {
  AdminSessionResponse,
  PhotoDeletionResponse,
  PublicPhotoListItem,
} from '@bouvet-team-photobooth/contracts'
import { LockKeyhole, LockKeyholeOpen } from '@lucide/vue'

const emit = defineEmits<{ removed: [] }>()
const { t } = useI18n()
const active = ref(false)
const submitting = ref(false)
const locking = ref(false)
const deletion = ref<PhotoDeletionResponse>()
const busy = computed(
  () => submitting.value || deletion.value?.status === 'pending',
)
const dialog = ref<HTMLDialogElement>()
const selected = ref<PublicPhotoListItem>()
const passphrase = ref('')
const errorKey = ref<
  | 'loginFailed'
  | 'rateLimited'
  | 'unavailable'
  | 'sessionExpired'
  | 'requestFailed'
  | 'statusFailed'
  | 'logoutFailed'
>()
const lockButton = ref<{ $el: HTMLButtonElement }>()
let opener: HTMLElement | undefined
let pageToken: string | undefined
let epoch = 0
let expiresAt = 0
let timer: ReturnType<typeof setInterval> | undefined
let polling = false
let renewing = false
let lastRenewedAt = 0

function openDialog(photo?: PublicPhotoListItem) {
  if (photo && (!active.value || busy.value)) return
  selected.value = photo
  errorKey.value = undefined
  opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined
  dialog.value?.showModal()
}

function closeDialog() {
  dialog.value?.close()
  passphrase.value = ''
  selected.value = undefined
  if (opener?.isConnected) opener.focus()
  else lockButton.value?.$el.focus()
}

function statusCode(error: unknown) {
  return error && typeof error === 'object' && 'statusCode' in error
    ? error.statusCode
    : undefined
}

async function lock() {
  const token = pageToken
  pageToken = undefined
  epoch += 1
  active.value = false
  submitting.value = false
  deletion.value = undefined
  errorKey.value = undefined
  if (timer) clearInterval(timer)
  timer = undefined
  closeDialog()
  if (!token) return
  locking.value = true
  try {
    await $fetch('/api/admin/session', {
      method: 'DELETE',
      headers: { 'x-admin-page-token': token },
      keepalive: true,
      retry: 0,
      timeout: 5_000,
    })
  } catch (error) {
    if (statusCode(error) !== 401) errorKey.value = 'logoutFailed'
  } finally {
    locking.value = false
  }
}

function handleSessionFailure(error: unknown) {
  if (statusCode(error) === 401 || statusCode(error) === 503) {
    void lock().then(() => {
      errorKey.value = 'sessionExpired'
    })
    return true
  }
  return false
}

async function tick() {
  if (!active.value || !pageToken) return
  if (Date.now() >= expiresAt) {
    await lock()
    errorKey.value = 'sessionExpired'
    return
  }
  const current = epoch
  const headers = { 'x-admin-page-token': pageToken }
  if (Date.now() - lastRenewedAt >= 60_000 && !renewing) {
    renewing = true
    try {
      const session = await $fetch<AdminSessionResponse>(
        '/api/admin/session/renew',
        { method: 'POST', headers, retry: 0, timeout: 10_000 },
      )
      if (current !== epoch) return
      expiresAt = Date.parse(session.expiresAt)
      lastRenewedAt = Date.now()
    } catch (error) {
      if (current === epoch && !handleSessionFailure(error))
        errorKey.value = 'statusFailed'
    } finally {
      renewing = false
    }
  }
  if (current !== epoch || deletion.value?.status !== 'pending' || polling)
    return
  polling = true
  try {
    const result = await $fetch<PhotoDeletionResponse>(
      `/api/admin/deletions/${deletion.value.operationId}`,
      { headers, retry: 0, timeout: 10_000 },
    )
    if (current !== epoch) return
    deletion.value = result
    errorKey.value = undefined
  } catch (error) {
    if (current === epoch && !handleSessionFailure(error))
      errorKey.value = 'statusFailed'
  } finally {
    polling = false
  }
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  errorKey.value = undefined
  const current = epoch
  const photo = selected.value
  try {
    if (photo && active.value && pageToken) {
      const result = await $fetch<PhotoDeletionResponse>(
        `/api/admin/photos/${photo.publicId}`,
        {
          method: 'DELETE',
          headers: { 'x-admin-page-token': pageToken },
          retry: 0,
          timeout: 20_000,
        },
      )
      if (current !== epoch) return
      deletion.value = result
      emit('removed')
    } else if (!photo) {
      if (!window.isSecureContext) {
        errorKey.value = 'unavailable'
        return
      }
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '')
      const phrase = passphrase.value
      passphrase.value = ''
      const session = await $fetch<AdminSessionResponse>('/api/admin/session', {
        method: 'POST',
        body: { passphrase: phrase, pageToken: token },
        retry: 0,
        timeout: 20_000,
      })
      if (current !== epoch) return
      pageToken = token
      active.value = true
      expiresAt = Date.parse(session.expiresAt)
      lastRenewedAt = Date.now()
      timer = setInterval(() => void tick(), 3_000)
    }
    closeDialog()
    if (photo) lockButton.value?.$el.focus()
  } catch (error) {
    if (current !== epoch) return
    if (photo) {
      if (!handleSessionFailure(error)) errorKey.value = 'requestFailed'
    } else {
      errorKey.value =
        statusCode(error) === 429
          ? 'rateLimited'
          : statusCode(error) === 401
            ? 'loginFailed'
            : 'unavailable'
    }
  } finally {
    if (current === epoch) submitting.value = false
  }
}

function cancel(event: Event) {
  if (submitting.value) event.preventDefault()
  else closeDialog()
}

function pageHide() {
  void lock()
}
onMounted(() => window.addEventListener('pagehide', pageHide))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', pageHide)
  void lock()
})

defineExpose({ active, busy, confirmDeletion: openDialog })
</script>

<template>
  <div class="photo-admin">
    <p v-if="errorKey && !dialog?.open" data-testid="admin-error" role="alert">
      {{ t(`overview.admin.errors.${errorKey}`) }}
    </p>
    <p
      v-else-if="deletion"
      data-testid="admin-deletion-status"
      :data-status="deletion.status"
      role="status"
    >
      {{ t(`overview.admin.deletion.${deletion.status}`) }}
    </p>
    <ActionButton
      ref="lockButton"
      variant="navigation"
      icon-only
      data-testid="admin-toggle"
      :aria-pressed="active"
      :disabled="locking"
      :aria-label="
        active ? t('overview.admin.lock') : t('overview.admin.unlock')
      "
      :title="active ? t('overview.admin.lock') : t('overview.admin.unlock')"
      @click="active ? lock() : openDialog()"
    >
      <LockKeyholeOpen v-if="active" :size="20" aria-hidden="true" />
      <LockKeyhole v-else :size="20" aria-hidden="true" />
    </ActionButton>
    <dialog
      ref="dialog"
      class="admin-dialog"
      data-testid="admin-dialog"
      aria-labelledby="admin-dialog-title"
      @cancel="cancel"
    >
      <form class="admin-form" @submit.prevent="submit">
        <h2 id="admin-dialog-title">
          {{
            selected
              ? t('overview.admin.confirmTitle')
              : t('overview.admin.loginTitle')
          }}
        </h2>
        <template v-if="selected">
          <img
            :src="selected.imageUrl"
            :alt="t('overview.imageAlt')"
            :width="selected.width"
            :height="selected.height"
          />
          <p>{{ t('overview.admin.confirmDescription') }}</p>
        </template>
        <template v-else>
          <label for="admin-passphrase">{{
            t('overview.admin.passphrase')
          }}</label>
          <input
            id="admin-passphrase"
            v-model="passphrase"
            data-testid="admin-passphrase"
            type="password"
            autocomplete="current-password"
            maxlength="512"
            required
            autofocus
          />
        </template>
        <p v-if="errorKey" data-testid="admin-dialog-error" role="alert">
          {{ t(`overview.admin.errors.${errorKey}`) }}
        </p>
        <p v-if="submitting" role="status">{{ t('overview.admin.working') }}</p>
        <div class="admin-actions">
          <ActionButton
            variant="secondary"
            data-testid="admin-cancel"
            :disabled="submitting"
            @click="closeDialog"
            >{{ t('overview.admin.cancel') }}</ActionButton
          >
          <ActionButton
            type="submit"
            data-testid="admin-submit"
            :disabled="submitting"
            >{{
              selected ? t('overview.admin.delete') : t('overview.admin.unlock')
            }}</ActionButton
          >
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.photo-admin {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-left: auto;
}
.photo-admin > p {
  max-width: 40ch;
  font-size: 14px;
}
.admin-dialog {
  width: min(480px, calc(100% - 2 * var(--page-gutter)));
  max-height: calc(100dvh - 2 * var(--space-5));
  padding: var(--space-5);
  border: 1px solid var(--color-divider);
  border-radius: var(--card-radius);
  background: var(--color-surface);
  color: var(--color-text);
}
.admin-dialog::backdrop {
  background: rgb(17 19 60 / 48%);
}
.admin-form {
  display: grid;
  gap: var(--space-3);
}
.admin-form h2,
.admin-form p {
  margin: 0;
}
.admin-form img {
  width: 100%;
  height: auto;
  max-height: 35dvh;
  object-fit: contain;
}
.admin-form input {
  min-width: 0;
  min-height: var(--control-height);
  padding: var(--space-2);
  border: 1px solid var(--color-muted-text);
  border-radius: var(--card-radius);
  font: inherit;
}
.admin-form input:focus-visible {
  outline: 3px solid var(--color-action-primary);
  outline-offset: 2px;
}
.admin-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>

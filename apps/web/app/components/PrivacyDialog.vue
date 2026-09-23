<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { X } from '@lucide/vue'

defineOptions({ name: 'PrivacyDialog' })

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<ComponentPublicInstance | null>(null)
const opener = ref<HTMLElement | null>(null)

const open = () => {
  if (!dialog.value || dialog.value.open) {
    return
  }

  opener.value =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  dialog.value.showModal()
  nextTick(() => {
    const button = closeButton.value?.$el
    if (button instanceof HTMLElement) {
      button.focus()
    }
  })
}

const close = () => {
  dialog.value?.close()
}

const closeFromBackdrop = (event: MouseEvent) => {
  if (event.target === dialog.value) {
    close()
  }
}

const restoreFocus = () => {
  opener.value?.focus()
  opener.value = null
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="privacy-dialog"
    data-testid="privacy-dialog"
    aria-labelledby="privacy-dialog-title"
    @click="closeFromBackdrop"
    @close="restoreFocus"
  >
    <article class="privacy-dialog__content">
      <header class="privacy-dialog__header">
        <div>
          <p class="privacy-dialog__eyebrow">{{ t('privacy.eyebrow') }}</p>
          <h2 id="privacy-dialog-title">{{ t('privacy.title') }}</h2>
        </div>
        <ActionButton
          ref="closeButton"
          variant="navigation"
          icon-only
          autofocus
          :aria-label="t('privacy.close')"
          :title="t('privacy.close')"
          data-testid="privacy-close"
          @click="close"
        >
          <X :size="24" aria-hidden="true" />
        </ActionButton>
      </header>

      <p class="privacy-dialog__intro">{{ t('privacy.introduction') }}</p>

      <section aria-labelledby="privacy-source-title">
        <h3 id="privacy-source-title">{{ t('privacy.source.title') }}</h3>
        <ul>
          <li>{{ t('privacy.source.camera') }}</li>
          <li>{{ t('privacy.source.purpose') }}</li>
          <li>{{ t('privacy.source.retention') }}</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-provider-title">
        <h3 id="privacy-provider-title">{{ t('privacy.provider.title') }}</h3>
        <p>{{ t('privacy.provider.description') }}</p>
      </section>

      <section aria-labelledby="privacy-result-title">
        <h3 id="privacy-result-title">{{ t('privacy.result.title') }}</h3>
        <ul>
          <li>{{ t('privacy.result.publication') }}</li>
          <li>{{ t('privacy.result.expiry') }}</li>
          <li>{{ t('privacy.result.copies') }}</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-session-title">
        <h3 id="privacy-session-title">{{ t('privacy.session.title') }}</h3>
        <p>{{ t('privacy.session.description') }}</p>
      </section>

      <section aria-labelledby="privacy-contact-title">
        <h3 id="privacy-contact-title">{{ t('privacy.contact.title') }}</h3>
        <p>{{ t('privacy.contact.description') }}</p>
      </section>
    </article>
  </dialog>
</template>

<style scoped>
.privacy-dialog {
  width: min(720px, calc(100% - (2 * var(--page-gutter))));
  max-height: calc(100dvh - (2 * var(--space-5)));
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-divider);
  border-radius: var(--card-radius);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 24px 64px rgb(17 19 60 / 18%);
}
.privacy-dialog::backdrop {
  background: rgb(17 19 60 / 48%);
}
.privacy-dialog__content {
  display: grid;
  max-height: inherit;
  gap: var(--space-5);
  padding: var(--space-6);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.privacy-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}
.privacy-dialog__eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-action-primary);
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}
h2,
h3,
p,
ul {
  margin: 0;
}
h2 {
  font-size: 32px;
  line-height: 1.2;
}
h3 {
  margin-bottom: var(--space-2);
  font-size: 20px;
  line-height: 1.3;
}
p,
li {
  line-height: 1.6;
}
ul {
  display: grid;
  gap: var(--space-2);
  padding-left: var(--space-5);
}
.privacy-dialog__intro {
  color: var(--color-muted-text);
  font-size: 17px;
}
@media (max-width: 480px) {
  .privacy-dialog {
    max-height: calc(100dvh - (2 * var(--space-3)));
  }
  .privacy-dialog__content {
    gap: var(--space-4);
    padding: var(--space-4);
  }
  h2 {
    font-size: 28px;
  }
}
</style>

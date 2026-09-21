import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import ThemeGrid from '~/components/ThemeGrid.vue'

const themes: ThemeDescriptor[] = [
  { id: 'wasteland', image: '/themes/wasteland.svg' },
  { id: 'samurai', image: '/themes/samurai.svg' },
]
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined

afterEach(() => wrapper?.unmount())

describe('ThemeGrid', () => {
  it('exposes Norwegian radio choices and updates the selected theme', async () => {
    wrapper = await mountSuspended(ThemeGrid, {
      props: { themes, modelValue: null },
    })

    const wasteland = wrapper.get('input[value="wasteland"]')
    expect(wasteland.attributes('type')).toBe('radio')
    expect(wasteland.element.closest('label')?.textContent).toContain(
      'Ødemark etter katastrofen',
    )
    await wasteland.setValue()

    expect(wrapper.emitted('update:modelValue')).toEqual([['wasteland']])
    expect(wrapper.get('.theme-card.selected').text()).toContain(
      'Ødemark etter katastrofen',
    )
  })
})

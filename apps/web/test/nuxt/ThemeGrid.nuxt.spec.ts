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
  it('exposes Norwegian theme buttons and emits the clicked theme', async () => {
    wrapper = await mountSuspended(ThemeGrid, {
      props: { themes },
    })

    const wasteland = wrapper.get('button')
    expect(wasteland.text()).toContain('Ødemark etter katastrofen')
    await wasteland.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['wasteland']])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import HealthStatus from '~/components/HealthStatus.vue'

const { useFetchMock } = vi.hoisted(() => ({ useFetchMock: vi.fn() }))
mockNuxtImport('useFetch', () => useFetchMock)

const request = {
  data: ref<{ status: string } | null>(null),
  status: ref('idle'),
  error: ref<Error | null>(null),
  refresh: vi.fn(),
}
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  request.data.value = null
  request.status.value = 'idle'
  request.error.value = null
  useFetchMock.mockReturnValue(request)
})

afterEach(() => wrapper?.unmount())

describe('HealthStatus', () => {
  it.each(['idle', 'pending'])('disables refresh while %s', async (status) => {
    request.status.value = status
    wrapper = await mountSuspended(HealthStatus)
    expect(wrapper.get('[role="status"]').text()).toBe('Checking service')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(useFetchMock.mock.calls[0]?.slice(0, 2)).toEqual([
      '/api/health',
      { server: false, retry: 0 },
    ])
  })

  it('shows the successful contract', async () => {
    request.status.value = 'success'
    request.data.value = { status: 'ok' }
    wrapper = await mountSuspended(HealthStatus)
    expect(wrapper.get('[role="status"]').text()).toBe('Connected')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('does not show stale success after failure and retries the request', async () => {
    request.status.value = 'error'
    request.data.value = { status: 'ok' }
    request.error.value = new Error(
      'Internal diagnostic must not reach the screen',
    )
    wrapper = await mountSuspended(HealthStatus)
    expect(wrapper.get('[role="status"]').text()).toBe('Service unavailable')
    expect(wrapper.text()).not.toContain(request.error.value.message)
    await wrapper.get('button').trigger('click')
    expect(request.refresh).toHaveBeenCalledOnce()
  })

  it('updates from loading to available and back to unavailable', async () => {
    wrapper = await mountSuspended(HealthStatus)
    request.status.value = 'success'
    request.data.value = { status: 'ok' }
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toBe('Connected')
    request.status.value = 'error'
    request.error.value = new Error('Unavailable')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toBe('Service unavailable')
  })

  it('does not accept an unexpected response as healthy', async () => {
    request.status.value = 'success'
    request.data.value = { status: 'unexpected' }
    wrapper = await mountSuspended(HealthStatus)
    expect(wrapper.get('[role="status"]').text()).toBe('Service unavailable')
  })
})

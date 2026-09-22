import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGeneratedOutput,
  submitGeneration,
} from '../../server/utils/generation-provider'

afterEach(() => {
  delete process.env.GENERATION_PROVIDER
  delete process.env.LEONARDO_API_KEY
  vi.unstubAllGlobals()
})

describe('generation provider', () => {
  it('submits one private Flare generation with a server-owned theme prompt', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ apiCreditCost: 23, generationId: 'provider-id' }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      submitGeneration({
        generationId: 'application-id',
        sourceImage: new Uint8Array([1, 2, 3]),
        themeId: 'space-cowboys',
      }),
    ).resolves.toEqual({
      apiCreditCost: 23,
      providerGenerationId: 'provider-id',
    })

    expect(providerFetch).toHaveBeenCalledOnce()
    const [url, request] = providerFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.leonardo.ai/api/rest/v2/generations')
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer test-api-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'openai/gpt-image-2.5-flare',
      parameters: {
        guidances: {
          image_reference: [{ image: { data: 'AQID', type: 'BASE64' } }],
        },
        height: 768,
        prompt:
          'Reimagine the people in the reference photo as a charismatic crew of space cowboys on a vivid frontier planet. Keep every person recognizable and preserve the group composition.',
        prompt_enhance: 'AUTO',
        quantity: 1,
        width: 1376,
      },
      public: false,
    })
  })

  it('rejects a malformed provider acceptance response', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ generationId: '' }), { status: 200 }),
        ),
    )

    await expect(
      submitGeneration({
        generationId: 'application-id',
        sourceImage: new Uint8Array([1]),
        themeId: 'wasteland',
      }),
    ).rejects.toThrow('Invalid generation provider response')
  })

  it('downloads a completed JPEG only from Leonardo CDN without credentials', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'content-length': '3',
          'content-type': 'image/jpeg; charset=binary',
        },
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      getGeneratedOutput(
        'provider-id',
        'https://cdn.leonardo.ai/generations/provider-id.jpg',
      ),
    ).resolves.toEqual({
      contentType: 'image/jpeg',
      image: new Uint8Array([1, 2, 3]),
    })

    const [url, request] = providerFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cdn.leonardo.ai/generations/provider-id.jpg')
    expect(request).toMatchObject({
      headers: { Accept: 'image/jpeg' },
      method: 'GET',
      redirect: 'error',
    })
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('rejects a completed output outside the Leonardo CDN', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      getGeneratedOutput('provider-id', 'https://attacker.example/output.jpg'),
    ).rejects.toThrow('Generation provider is unavailable')
    expect(providerFetch).not.toHaveBeenCalled()
  })
})

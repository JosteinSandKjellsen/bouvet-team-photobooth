import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGenerationSourceUpload,
  deleteGenerationSource,
  getGenerationCompletion,
  getGeneratedOutput,
  submitGeneration,
  uploadGenerationSource,
} from '../../server/utils/generation-provider'
import type { GenerationSourceDeletionError } from '../../server/utils/generation-provider'
import {
  currentGenerationModelProfileId,
  nanoBananaModelProfileId,
} from '../../server/utils/generation-models'
import { samuraiPrompt } from '../../server/utils/theme-prompts/samurai'
import { spaceCowboysPrompt } from '../../server/utils/theme-prompts/space-cowboys'

afterEach(() => {
  delete process.env.GENERATION_PROVIDER
  delete process.env.LEONARDO_API_KEY
  vi.unstubAllGlobals()
})

describe('generation provider', () => {
  it('deletes a Leonardo source only after a matching confirmed response', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const sourceId = '11111111-1111-4111-8111-111111111111'
    const providerFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ delete_init_images_by_pk: { id: sourceId } }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
    vi.stubGlobal('fetch', providerFetch)

    await expect(deleteGenerationSource(sourceId)).resolves.toBeUndefined()
    expect(providerFetch).toHaveBeenCalledWith(
      `https://cloud.leonardo.ai/api/rest/v1/init-image/${sourceId}`,
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-api-key',
        },
        method: 'DELETE',
      }),
    )
  })

  it('does not retry an unconfirmed Leonardo source deletion response', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ delete_init_images_by_pk: null }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    await expect(
      deleteGenerationSource('11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject<Partial<GenerationSourceDeletionError>>({
      message: 'Unconfirmed generation source deletion response',
      retryable: false,
    })
  })

  it('uploads the source before submitting one private Sunburst generation', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadInitImage: {
              fields: JSON.stringify({ key: 'source-key', policy: 'policy' }),
              id: 'source-id',
              url: 'https://uploads.example/source',
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            generate: { apiCreditCost: 23, generationId: 'provider-id' },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
    vi.stubGlobal('fetch', providerFetch)

    const upload = await createGenerationSourceUpload()
    await uploadGenerationSource(upload, new Uint8Array([1, 2, 3]))
    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: upload.providerSourceImageId,
        themeId: 'space-cowboys',
      }),
    ).resolves.toEqual({
      apiCreditCost: 23,
      providerGenerationId: 'provider-id',
    })

    expect(providerFetch).toHaveBeenCalledTimes(3)
    const [initUrl, initRequest] = providerFetch.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(initUrl).toBe('https://cloud.leonardo.ai/api/rest/v1/init-image')
    expect(initRequest).toMatchObject({
      body: JSON.stringify({ extension: 'jpg' }),
      method: 'POST',
    })
    expect(initRequest.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer test-api-key',
      'Content-Type': 'application/json',
    })

    const [uploadUrl, uploadRequest] = providerFetch.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(uploadUrl).toBe('https://uploads.example/source')
    expect(uploadRequest.method).toBe('POST')
    expect(uploadRequest.headers).toBeUndefined()
    expect(uploadRequest.redirect).toBe('error')
    expect(uploadRequest.body).toBeInstanceOf(FormData)
    const formData = uploadRequest.body as FormData
    expect([...formData.keys()]).toEqual(['key', 'policy', 'file'])
    const file = formData.get('file')
    expect(file).toBeInstanceOf(Blob)
    await expect((file as Blob).arrayBuffer()).resolves.toEqual(
      Uint8Array.of(1, 2, 3).buffer,
    )

    const [generationUrl, generationRequest] = providerFetch.mock.calls[2] as [
      string,
      RequestInit,
    ]
    expect(generationUrl).toBe(
      'https://cloud.leonardo.ai/api/rest/v2/generations',
    )
    expect(generationRequest.method).toBe('POST')
    expect(JSON.parse(generationRequest.body as string)).toEqual({
      model: 'openai/gpt-image-2.5-sunburst',
      parameters: {
        guidances: {
          image_reference: [{ image: { id: 'source-id', type: 'UPLOADED' } }],
        },
        height: 768,
        prompt: spaceCowboysPrompt,
        prompt_enhance: 'OFF',
        quality: 'MEDIUM',
        quantity: 1,
        style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
        width: 1376,
      },
      public: false,
    })
  })

  it('submits Samurai with the Nano Banana profile parameters', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generate: { apiCreditCost: 23, generationId: 'provider-id' },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    )
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: nanoBananaModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'samurai',
      }),
    ).resolves.toEqual({
      apiCreditCost: 23,
      providerGenerationId: 'provider-id',
    })

    const [, request] = providerFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'nano-banana-2-lite',
      parameters: {
        guidances: {
          image_reference: [{ image: { id: 'source-id', type: 'UPLOADED' } }],
        },
        height: 768,
        prompt: samuraiPrompt,
        prompt_enhance: 'OFF',
        quantity: 1,
        style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
        width: 1376,
      },
      public: false,
    })
  })

  it('rejects malformed init-image responses before uploading bytes', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uploadInitImage: {
            fields: '{invalid-json',
            id: 'source-id',
            url: 'https://uploads.example/source',
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', providerFetch)

    await expect(createGenerationSourceUpload()).rejects.toThrow(
      'Invalid generation source upload response',
    )
    expect(providerFetch).toHaveBeenCalledOnce()
  })

  it('requires a 204 response from the presigned upload', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      uploadGenerationSource(
        {
          fields: { key: 'source-key' },
          providerSourceImageId: 'source-id',
          uploadUrl: 'https://uploads.example/source',
        },
        Uint8Array.of(1, 2, 3),
      ),
    ).rejects.toThrow('Generation source upload failed (status=200)')
    const [, request] = providerFetch.mock.calls[0] as [string, RequestInit]
    expect(request.headers).toBeUndefined()
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
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).rejects.toThrow('Invalid generation provider response')
  })

  it('does not submit an unapproved model profile', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: 'unapproved-model',
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).rejects.toThrow('Generation provider is unavailable')
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('accepts a nested provider response with a null credit cost', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generate: {
              apiCreditCost: null,
              generationId: 'provider-id',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).resolves.toEqual({
      apiCreditCost: undefined,
      providerGenerationId: 'provider-id',
    })
  })

  it('classifies a non-JSON provider response as an uncertain outcome', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('upstream failure', { status: 200 })),
    )

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).rejects.toThrow(
      'Invalid generation provider response (status=200, type=non-json)',
    )
  })

  it('rejects a GraphQL error array returned with HTTP 200', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              extensions: { code: 'BAD_USER_INPUT' },
              locations: [{ column: 1, line: 1 }],
              message: 'Invalid generation request',
              path: ['createGeneration'],
            },
          ]),
          { headers: { 'x-request-id': 'request-id' }, status: 200 },
        ),
      ),
    )

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).rejects.toThrow(
      'Invalid generation provider response (requestId=request-id, arrayLength=1, firstItemKeys=extensions|locations|message|path, errorCode=BAD_USER_INPUT, errorMessage=Invalid generation request)',
    )
  })

  it('redacts provider values while reporting a malformed array', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              extensions: { code: 'invalid-code-secret' },
              message:
                'Rejected "private prompt" at https://secret.example/value with AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              privateValue: 'secret',
            },
          ]),
          {
            headers: { 'x-request-id': 'request-id' },
            status: 200,
          },
        ),
      ),
    )

    await expect(
      submitGeneration({
        generationId: 'application-id',
        modelProfileId: currentGenerationModelProfileId,
        providerSourceImageId: 'source-id',
        themeId: 'wasteland',
      }),
    ).rejects.toThrow(
      'Invalid generation provider response (requestId=request-id, arrayLength=1, firstItemKeys=extensions|message|privateValue, errorMessage=Rejected <redacted> at <redacted-url> with <redacted-value>)',
    )
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

  it('reads the completed output URL from the Leonardo generation status', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generations_by_pk: {
            generated_images: [
              {
                id: 'image-id',
                url: 'https://cdn.leonardo.ai/generations/provider-id.jpg',
              },
            ],
            id: 'provider-id',
            status: 'COMPLETE',
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', providerFetch)

    await expect(getGenerationCompletion('provider-id')).resolves.toEqual({
      providerOutputUrl: 'https://cdn.leonardo.ai/generations/provider-id.jpg',
      status: 'COMPLETE',
    })
    expect(providerFetch).toHaveBeenCalledWith(
      'https://cloud.leonardo.ai/api/rest/v1/generations/provider-id',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-api-key',
        },
        method: 'GET',
      }),
    )
  })

  it('keeps a pending Leonardo generation pending without an output URL', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    process.env.LEONARDO_API_KEY = 'test-api-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generations_by_pk: {
              generated_images: [],
              id: 'provider-id',
              status: 'PENDING',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(getGenerationCompletion('provider-id')).resolves.toEqual({
      status: 'PENDING',
    })
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

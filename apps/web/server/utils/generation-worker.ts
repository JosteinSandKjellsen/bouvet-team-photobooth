export async function triggerGenerationWorker() {
  const siteUrl = process.env.URL
  const workerToken = process.env.NUXT_GENERATION_WORKER_TOKEN
  if (!siteUrl || !workerToken) {
    console.warn('Generation worker trigger is not configured')
    return
  }

  try {
    const response = await fetch(
      new URL('/.netlify/functions/generation-submit-background', siteUrl),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${workerToken}` },
        signal: AbortSignal.timeout(3_000),
      },
    )
    if (!response.ok) {
      console.warn(`Generation worker trigger returned HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn('Generation worker trigger failed', error)
  }
}

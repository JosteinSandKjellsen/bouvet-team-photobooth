import type { GenerationStatusResponse } from '@bouvet-team-photobooth/contracts'
import type { GenerationStatus } from '../../../generated/prisma/enums'
import { db } from '../../../utils/db'
import { getCurrentSession, sessionCookieName } from '../../../utils/sessions'

const generationStatuses = {
  FAILED: 'failed',
  PENDING: 'pending',
  READY_TO_SUBMIT: 'submitting',
  SUBMISSION_UNKNOWN: 'submission_unknown',
  SUBMITTED: 'submitted',
  SUBMITTING: 'submitting',
  SUCCEEDED: 'succeeded',
  UPLOADING: 'submitting',
} as const satisfies Record<
  GenerationStatus,
  GenerationStatusResponse['status']
>

export default defineEventHandler(
  async (event): Promise<GenerationStatusResponse> => {
    const capability = getCookie(event, sessionCookieName)
    if (!capability) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const session = await getCurrentSession(capability)
    if (!session) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const generation = await db.imageGeneration.findFirst({
      where: { sourceImage: { sessionId: session.id } },
      select: {
        generatedImage: { select: { publicId: true, status: true } },
        id: true,
        status: true,
      },
    })
    if (!generation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Generation not found',
      })
    }

    const response: GenerationStatusResponse = {
      jobId: generation.id,
      status: generationStatuses[generation.status as GenerationStatus],
    }
    if (
      generation.status === 'SUCCEEDED' &&
      generation.generatedImage?.status === 'ACTIVE'
    ) {
      response.resultPath = `/photo/${generation.generatedImage.publicId}`
    }

    return response
  },
)

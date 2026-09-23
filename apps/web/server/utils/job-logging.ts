const maxErrorMessageLength = 500

type JobLogDetails = Record<string, boolean | number | string | undefined>

export function logJobFailure(
  message: string,
  error: unknown,
  details: JobLogDetails = {},
) {
  console.error(message, {
    ...details,
    errorCode: getErrorCode(error),
    errorMessage: getErrorMessage(error),
    errorName: error instanceof Error ? error.name : typeof error,
  })
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return
  const code = error.code
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : undefined
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Unknown job failure'
  return error.message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:https?|postgres(?:ql)?|s3):\/\/[^\s"']+/gi, '[redacted-url]')
    .replace(/\b(api[_ -]?key|password|token)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, maxErrorMessageLength)
}

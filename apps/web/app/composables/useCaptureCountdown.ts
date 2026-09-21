import { ref } from 'vue'

const COUNTDOWN_DURATION_MS = 3_000

type CaptureCountdownOptions = {
  clock?: () => number
  onComplete: () => void
}

export function useCaptureCountdown({
  clock = () => performance.now(),
  onComplete,
}: CaptureCountdownOptions) {
  const remainingSeconds = ref(0)
  const isCountingDown = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let countdownToken = 0
  let captureAt = 0

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function cancel() {
    countdownToken += 1
    clearTimer()
    isCountingDown.value = false
    remainingSeconds.value = 0
  }

  function update(token: number) {
    if (token !== countdownToken || !isCountingDown.value) {
      return
    }

    const remainingMs = captureAt - clock()
    if (remainingMs <= 0) {
      isCountingDown.value = false
      remainingSeconds.value = 0
      timer = undefined
      onComplete()
      return
    }

    remainingSeconds.value = Math.ceil(remainingMs / 1_000)
    const delay = remainingMs - (remainingSeconds.value - 1) * 1_000
    timer = setTimeout(() => update(token), delay)
  }

  function start() {
    if (isCountingDown.value) {
      return false
    }

    const token = ++countdownToken
    captureAt = clock() + COUNTDOWN_DURATION_MS
    isCountingDown.value = true
    update(token)
    return true
  }

  return { cancel, isCountingDown, remainingSeconds, start }
}

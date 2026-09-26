import { randomBytes, scryptSync } from 'node:crypto'
import { emitKeypressEvents } from 'node:readline'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function hashAdminPassphrase(passphrase) {
  if (passphrase.length < 8 || passphrase.length > 512) {
    throw new Error('Use a unique passphrase between 8 and 512 characters.')
  }
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(passphrase, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt:${salt}:${key.toString('hex')}`
}

async function main() {
  if (!process.stdin.isTTY)
    throw new Error(
      'Run in an interactive terminal; do not pass a secret as a command argument.',
    )
  process.stdout.write('Admin passphrase (input hidden): ')
  const phrase = await new Promise((accept) => {
    let input = ''
    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    function finish(value) {
      process.stdin.off('keypress', onKey)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      accept(value)
    }
    function onKey(text, key) {
      if (key?.ctrl && key.name === 'c') return finish(undefined)
      if (key?.name === 'return') return finish(input)
      if (key?.name === 'backspace')
        input = Array.from(input).slice(0, -1).join('')
      else if (text && !key?.ctrl && !key?.meta) input += text
    }
    process.stdin.on('keypress', onKey)
  })
  if (phrase === undefined) {
    process.exitCode = 1
    return
  }
  console.log(hashAdminPassphrase(phrase))
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

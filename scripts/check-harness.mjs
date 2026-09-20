import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { marked } from 'marked'
import { minimatch } from 'minimatch'
import { parse } from 'yaml'

export const requiredCommands = [
  'dev',
  'prepare',
  'build',
  'start',
  'lint',
  'lint:fix',
  'format',
  'format:check',
  'typecheck',
  'test',
  'test:e2e',
  'check',
  'check:harness',
]

export const canonicalPlaybooks = [
  'docs/camera-and-initial-image-playbook.md',
  'docs/leonardo-integration-playbook.md',
  'docs/prisma-data-and-jobs-playbook.md',
]

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  '.nuxt',
  '.output',
  '.pnpm-store',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
])
const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : listFiles(root, path)
    }
    return entry.isFile() ? [relative(root, path).split(sep).join('/')] : []
  })
}

export function validateHarness(directory) {
  const root = resolve(directory)
  const files = listFiles(root)
  const errors = []
  const rootInstructions = '.github/copilot-instructions.md'
  const instructions = files.filter(
    (file) =>
      file.startsWith('.github/instructions/') &&
      file.endsWith('.instructions.md'),
  )
  const skills = files.filter(
    (file) => file.startsWith('.github/skills/') && file.endsWith('/SKILL.md'),
  )
  const markdown = files.filter(
    (file) =>
      file.endsWith('.md') &&
      (file.startsWith('.github/') ||
        file.startsWith('docs/') ||
        file === 'README.md'),
  )
  const playbooks = new Set([
    ...canonicalPlaybooks,
    ...files.filter(
      (file) => file.startsWith('docs/') && file.endsWith('-playbook.md'),
    ),
  ])
  const linksByFile = new Map()

  for (const file of [rootInstructions, ...playbooks]) {
    if (!files.includes(file)) errors.push(`Missing required document: ${file}`)
  }
  if (!instructions.length) errors.push('No scoped instructions found')
  if (!skills.length) errors.push('No skills found')

  for (const file of [...instructions, ...skills]) {
    const source = readFileSync(join(root, file), 'utf8')
    const match = frontmatterPattern.exec(source)
    if (!match) {
      errors.push(`${file}: missing YAML frontmatter`)
      continue
    }
    let metadata
    try {
      metadata = parse(match[1])
    } catch (error) {
      errors.push(`${file}: invalid YAML: ${error.message}`)
      continue
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      errors.push(`${file}: frontmatter must be a mapping`)
      continue
    }
    if (
      typeof metadata.description !== 'string' ||
      !metadata.description.trim() ||
      metadata.description.length > 1024
    ) {
      errors.push(`${file}: description must contain 1-1024 characters`)
    }
    if (!source.slice(match[0].length).trim())
      errors.push(`${file}: missing instruction body`)

    if (instructions.includes(file)) {
      if (typeof metadata.applyTo !== 'string' || !metadata.applyTo.trim()) {
        errors.push(
          `${file}: applyTo must be a nonempty comma-separated string`,
        )
        continue
      }
      for (const pattern of metadata.applyTo
        .split(',')
        .map((value) => value.trim())) {
        if (!pattern || ['*', '**', '**/*'].includes(pattern)) {
          errors.push(
            `${file}: use a specific applyTo pattern, not '${pattern}'`,
          )
        } else if (
          !files.some((candidate) =>
            minimatch(candidate, pattern, { dot: true }),
          )
        ) {
          errors.push(`${file}: unmatched applyTo pattern '${pattern}'`)
        }
      }
    } else {
      const folder = file.split('/').at(-2)
      if (
        typeof metadata.name !== 'string' ||
        metadata.name.length > 64 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) ||
        metadata.name !== folder
      ) {
        errors.push(`${file}: skill name must be valid and match its folder`)
      }
    }
  }

  for (const file of markdown) {
    const source = readFileSync(join(root, file), 'utf8').replace(
      frontmatterPattern,
      '',
    )
    const links = new Set()
    marked.walkTokens(marked.lexer(source), (token) => {
      if (token.type !== 'link' && token.type !== 'image') return
      try {
        const target = token.href.startsWith('/')
          ? new URL(`.${token.href}`, pathToFileURL(`${root}${sep}`))
          : new URL(token.href, pathToFileURL(join(root, file)))
        if (target.protocol !== 'file:') return
        const path = fileURLToPath(target)
        const normalized = relative(root, path).split(sep).join('/')
        links.add(normalized)
        if (!existsSync(path))
          errors.push(`${file}: broken local link '${token.href}'`)
      } catch {
        errors.push(`${file}: invalid link '${token.href}'`)
      }
    })
    linksByFile.set(file, links)
  }

  for (const playbook of playbooks) {
    if (!linksByFile.get(rootInstructions)?.has(playbook)) {
      errors.push(`Root instructions must reference ${playbook}`)
    }
    if (
      ![...instructions, ...skills].some((file) =>
        linksByFile.get(file)?.has(playbook),
      )
    ) {
      errors.push(`Scoped instructions or skills must reference ${playbook}`)
    }
  }

  try {
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    )
    for (const command of requiredCommands) {
      if (
        typeof manifest.scripts?.[command] !== 'string' ||
        !manifest.scripts[command].trim()
      ) {
        errors.push(`Missing root command: ${command}`)
      }
    }
  } catch (error) {
    errors.push(`Cannot read root package.json: ${error.message}`)
  }
  return errors
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const root =
    process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const errors = validateHarness(root)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      'Harness metadata, scopes, commands, playbook coverage and local links passed.',
    )
  }
}

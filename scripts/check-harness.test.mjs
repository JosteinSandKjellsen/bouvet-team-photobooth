import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  canonicalPlaybooks,
  requiredCommands,
  validateHarness,
} from './check-harness.mjs'

let root
const rootInstructions = '.github/copilot-instructions.md'
const scopedFile = '.github/instructions/frontend.instructions.md'
const skillFile = '.github/skills/verify-change/SKILL.md'
const scopedLinks = canonicalPlaybooks
  .map((file) => `[Guide](../../${file})`)
  .join('\n')

function write(file, content) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'photobooth-harness-'))
  write(
    'package.json',
    JSON.stringify({
      scripts: Object.fromEntries(
        requiredCommands.map((name) => [name, 'node --version']),
      ),
    }),
  )
  write('apps/web/app/app.vue', '<template><main>Fixture</main></template>')
  for (const file of canonicalPlaybooks)
    write(file, '# Playbook\n\nFuture guidance.\n')
  write(
    rootInstructions,
    canonicalPlaybooks.map((file) => `[Guide](../${file})`).join('\n'),
  )
  write(
    scopedFile,
    `---\ndescription: "Use when editing Vue"\napplyTo: "apps/web/app/**"\n---\n${scopedLinks}\n`,
  )
  write(
    skillFile,
    '---\nname: verify-change\ndescription: "Use for verification"\n---\nRun focused checks.\n',
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

test('accepts a valid harness', () => {
  assert.deepEqual(validateHarness(root), [])
})

test('rejects a missing canonical design playbook', () => {
  rmSync(join(root, 'docs/design-playbook.md'))
  assert.ok(
    validateHarness(root).includes(
      'Missing required document: docs/design-playbook.md',
    ),
  )
})

test('rejects only the design guide being omitted from root routing', () => {
  write(
    rootInstructions,
    canonicalPlaybooks
      .filter((file) => file !== 'docs/design-playbook.md')
      .map((file) => `[Guide](../${file})`)
      .join('\n'),
  )
  assert.deepEqual(validateHarness(root), [
    'Root instructions must reference docs/design-playbook.md',
  ])
})

test('rejects only the design guide being omitted from task routing', () => {
  const links = canonicalPlaybooks
    .filter((file) => file !== 'docs/design-playbook.md')
    .map((file) => `[Guide](../../${file})`)
    .join('\n')
  write(
    scopedFile,
    `---\ndescription: "Use for Vue"\napplyTo: "apps/web/app/**"\n---\n${links}\n`,
  )
  assert.deepEqual(validateHarness(root), [
    'Scoped instructions or skills must reference docs/design-playbook.md',
  ])
})

test('rejects malformed YAML', () => {
  write(scopedFile, '---\ndescription: [unclosed\n---\nCheck.\n')
  assert.match(validateHarness(root).join('\n'), /invalid YAML/)
})

test('rejects missing and mismatched skill names', () => {
  for (const name of ['', 'name: wrong-name\n']) {
    write(skillFile, `---\n${name}description: "Run checks"\n---\nCheck.\n`)
    assert.match(
      validateHarness(root).join('\n'),
      /skill name must be valid and match/,
    )
  }
})

test('rejects unmatched and blanket instruction patterns', () => {
  for (const pattern of ['apps/missing/**', '**']) {
    write(
      scopedFile,
      `---\ndescription: "Use for Vue"\napplyTo: "${pattern}"\n---\n${scopedLinks}\n`,
    )
    assert.match(
      validateHarness(root).join('\n'),
      /unmatched applyTo|specific applyTo/,
    )
  }
})

test('rejects broken local links, including reference links', () => {
  write('docs/example.md', '[Missing guide][guide]\n\n[guide]: ./missing.md\n')
  assert.match(validateHarness(root).join('\n'), /broken local link/)
})

test('rejects playbooks omitted from root guidance', () => {
  write(rootInstructions, '# Project\n')
  assert.match(
    validateHarness(root).join('\n'),
    /Root instructions must reference/,
  )
})

test('rejects playbooks without task-specific routing', () => {
  write(
    scopedFile,
    '---\ndescription: "Use for Vue"\napplyTo: "apps/web/app/**"\n---\nRun checks.\n',
  )
  assert.match(
    validateHarness(root).join('\n'),
    /Scoped instructions or skills must reference/,
  )
})

test('rejects missing documented commands', () => {
  write('package.json', '{"scripts":{}}')
  assert.match(
    validateHarness(root).join('\n'),
    /Missing root command: check:harness/,
  )
})

test('CLI exits nonzero for invalid harness metadata', () => {
  write(skillFile, '# Missing metadata\n')
  const script = fileURLToPath(new URL('./check-harness.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, root], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing YAML frontmatter/)
})

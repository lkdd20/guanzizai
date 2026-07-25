import { readFile } from 'node:fs/promises'

const files = process.argv.slice(2).filter((value) => value !== '--')
if (!files.length) {
  process.stderr.write('Usage: node scripts/check-reader-glyphs.mjs <json-or-jsonl> [...]\n')
  process.exit(1)
}

const controls = new Map()
const privateUse = new Map()
const supplementaryCjk = new Map()
let characters = 0

function record(map, character, file) {
  const codePoint = character.codePointAt(0)
  const key = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
  const current = map.get(key) ?? { character, count: 0, files: new Set() }
  current.count += 1
  current.files.add(file)
  map.set(key, current)
}

function inspect(value, file) {
  if (typeof value === 'string') {
    for (const character of value) {
      characters += 1
      const code = character.codePointAt(0)
      if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0x7f && code <= 0x9f)) record(controls, character, file)
      if ((code >= 0xe000 && code <= 0xf8ff) || (code >= 0xf0000 && code <= 0xffffd) || (code >= 0x100000 && code <= 0x10fffd)) record(privateUse, character, file)
      if (code >= 0x20000 && code <= 0x323af) record(supplementaryCjk, character, file)
    }
    return
  }
  if (Array.isArray(value)) value.forEach((item) => inspect(item, file))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => inspect(item, file))
}

for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (file.endsWith('.jsonl')) source.split(/\r?\n/u).filter(Boolean).forEach((line) => inspect(JSON.parse(line), file))
  else inspect(JSON.parse(source), file)
}

function output(map) {
  return [...map.entries()].map(([codePoint, item]) => ({
    codePoint,
    character: item.character,
    count: item.count,
    files: [...item.files],
  }))
}

const report = {
  files: files.length,
  characters,
  controls: output(controls),
  privateUse: output(privateUse),
  supplementaryCjk: output(supplementaryCjk),
  passed: controls.size === 0,
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.passed) process.exitCode = 2
